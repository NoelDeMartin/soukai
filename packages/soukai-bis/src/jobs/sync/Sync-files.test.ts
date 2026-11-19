import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import User from 'soukai-bis/testing/stubs/User';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import type { FilePushedEvent } from './Sync';
import { createUnsyncedDocument, setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync files', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());
    });

    it('pulls container files metadata', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const imageModifiedAt = new Date('2026-11-17T07:00:00Z');
        const invalidateComputedAttributesCache = vi.spyOn(ComputedAttributesCache.requireInstance(), 'invalidate');
        let syncedFileUrls = new Set<string>();

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle({ [documentUrl]: { lastModifiedAt: new Date() }, [imageUrl]: { lastModifiedAt: imageModifiedAt } })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        const localContainer = await localEngine.readDocument(containerUrl);
        const file = await localEngine.getFile(imageUrl);

        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg', lastModifiedAt: imageModifiedAt });
        expect(file?.blob).toBeUndefined();
        expect(syncedFileUrls).toEqual(new Set([imageUrl]));
        expect(invalidateComputedAttributesCache).toHaveBeenCalledWith({
            documentUrls: expect.arrayContaining([imageUrl]),
        });
        expect(localContainer.statements(containerUrl, 'ldp:contains', imageUrl)).toHaveLength(1);
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
    });

    it('downloads offline container files', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle([documentUrl, imageUrl])}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/jpeg' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
            ],
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg', availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('reports offline files download progress', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const progressUpdates: number[] = [];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle([documentUrl, imageUrl])}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/jpeg' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
            ],
            onUpdated: (progress) => progressUpdates.push(progress),
        });

        // Assert
        expect(progressUpdates).toContain(0.9);
        expect(progressUpdates.at(-1)).toEqual(1);
        expect(progressUpdates.indexOf(0.9)).toBeLessThan(progressUpdates.indexOf(1));
    });

    it('removes files deleted remotely', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));

        await localEngine.updateFile(imageUrl, { mimeType: 'image/jpeg', lastModifiedAt: new Date() });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toBeNull();
    });

    it('pulls container files again after failing to process them', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const registeredContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: registeredContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });
        const imageUrl = `${nestedContainerUrl}image.jpg`;
        const applicationModels = [{ model: User, registration: true, files: [{ strategy: 'container' as const }] }];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: registeredContainerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            registeredContainerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix extra: <https://vocab.noeldemartin.com/solid-extra/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <> a ldp:Container ; ldp:contains <${nestedContainerUrl}> .

                <${nestedContainerUrl}>
                    a ldp:Resource, ldp:Container, ldp:BasicContainer ;
                    extra:deepLastModified "2026-06-19T07:17:00.000Z"^^xsd:dateTime .
            `,
        );
        FakeServer.respond(
            nestedContainerUrl,
            `
                ${containerTurtle({
                    [documentUrl]: { lastModifiedAt: new Date('2026-06-19T07:17:00.000Z') },
                    [imageUrl]: { lastModifiedAt: new Date('2026-06-19T07:17:00.000Z') },
                })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
                <> <https://vocab.noeldemartin.com/solid-extra/deepLastModified>
                    "2026-06-19T07:17:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));

        const updateFile = vi.spyOn(localEngine, 'updateFile').mockRejectedValueOnce(new Error('Interrupted'));

        await Sync.run({ ...config, applicationModels });

        updateFile.mockRestore();

        // Act
        await Sync.run({ ...config, applicationModels });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg' });
    });

    it('skips files rules when nothing changed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const documentModifiedAt = new Date('2026-11-17T07:00:00Z');
        const imageModifiedAt = new Date('2026-11-17T08:00:00Z');

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle({
                    [documentUrl]: { lastModifiedAt: documentModifiedAt },
                    [imageUrl]: { lastModifiedAt: imageModifiedAt },
                })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })), {
            lastModifiedAt: documentModifiedAt,
        });
        await localEngine.updateFile(imageUrl, { mimeType: 'image/jpeg', lastModifiedAt: imageModifiedAt });

        const readDocuments = vi.spyOn(localEngine, 'readDocuments');
        const getContainerUrls = vi.spyOn(localEngine, 'getContainerUrls');

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: true,
                    files: [
                        { strategy: 'container' },
                        { strategy: 'document', fields: ['friendUrls'], availableOffline: true },
                    ],
                },
            ],
        });

        // Assert
        expect(FakeServer.getRequests(documentUrl)).toHaveLength(0);
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
        expect(readDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ containerUrl }));
        expect(getContainerUrls).not.toHaveBeenCalled();
    });

    it('pushes local files', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;
        const pushedFiles: FilePushedEvent[] = [];
        let syncedFileUrls = new Set<string>();

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
            onFilePushed: (event) => pushedFiles.push(event),
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(FakeServer.getRequest('PUT', imageUrl)?.headers).toEqual({
            'Content-Type': 'image/png',
            'If-None-Match': '*',
        });
        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/png' });
        expect(file?.blob).toBeUndefined();
        expect(file?.lastModifiedAt).toBeInstanceOf(Date);
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        expect(syncedFileUrls.has(imageUrl)).toBe(true);
        expect(pushedFiles).toHaveLength(1);
        expect(pushedFiles[0]).toMatchObject({ url: imageUrl });
        expect(await pushedFiles[0]?.blob.text()).toEqual('image');
    });

    it('keeps files modified locally while they are pushed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnceWith(imageUrl, async () => {
            vi.advanceTimersByTime(1000);

            await localEngine.writeFile(imageUrl, new Blob(['modified'], { type: 'image/png' }), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            return FakeResponse.created();
        });

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('modified');
    });

    it('keeps offline files after pushing them', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;
        const pushedFiles: FilePushedEvent[] = [];

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: false, files: [{ strategy: 'container', availableOffline: true }] },
            ],
            onFilePushed: (event) => pushedFiles.push(event),
        });

        // Assert
        expect(FakeServer.getRequest('PUT', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
        expect(pushedFiles).toHaveLength(0);
    });

    it('pushes local file deletions', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnce(imageUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image']), { lastModifiedAt: new Date() });
        await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(FakeServer.getRequest('DELETE', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('keeps files uploaded locally while their deletion is pushed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnceWith(imageUrl, async () => {
            vi.advanceTimersByTime(1000);

            await localEngine.writeFile(imageUrl, new Blob(['uploaded'], { type: 'image/png' }), {
                localChanges: fileLocalChanges(imageUrl, 'created'),
            });

            return FakeResponse.success();
        });

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image']), { lastModifiedAt: new Date() });
        await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(FakeServer.getRequest('DELETE', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ lastModifiedAt: null });
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('uploaded');
    });

    it('downloads offline files referenced in document fields', async () => {
        // Arrange
        let syncedFileUrls = new Set<string>();
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(
            documentUrl,
            `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Alice" ;
                <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
        );
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: true,
                    files: [{ strategy: 'document', fields: ['friendUrls'], availableOffline: true }],
                },
            ],
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
        expect(syncedFileUrls.has(imageUrl)).toBe(true);
    });

    it('retries failed downloads of files referenced in document fields', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;
        const applicationModels = [
            {
                model: User,
                registration: true,
                files: [{ strategy: 'document' as const, fields: ['friendUrls'], availableOffline: true }],
            },
        ];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(
            documentUrl,
            `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Alice" ;
                <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
        );
        FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 500));

        await Sync.run({ ...config, applicationModels });

        typeIndex.relatedRegistrations.related = [];

        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        // Act
        await Sync.run({ ...config, applicationModels });

        // Assert
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('pushes local files referenced in document fields', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imagesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const imageUrl = `${imagesContainerUrl}avatar.png`;

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(
            documentUrl,
            turtleToQuadsSync(
                `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                    <http://xmlns.com/foaf/0.1/name> "Alice" ;
                    <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
                { baseIRI: documentUrl },
            ),
        );
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: false, files: [{ strategy: 'document', fields: ['friendUrls'] }] },
            ],
        });

        // Assert
        expect(FakeServer.getRequest('PUT', imageUrl)).not.toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('downloads offline files referenced by documents merged while pushing', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const uploadUrl = `${containerUrl}upload.png`;
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;

        FakeServer.respond(
            documentUrl,
            `
                ${syncFixture('person.ttl', { documentUrl })}

                <#it> <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .

                <#operation-4>
                    a <https://vocab.noeldemartin.com/crdt/AddPropertyOperation> ;
                    <https://vocab.noeldemartin.com/crdt/resource> <#it> ;
                    <https://vocab.noeldemartin.com/crdt/property> <http://xmlns.com/foaf/0.1/knows> ;
                    <https://vocab.noeldemartin.com/crdt/value> <${imageUrl}> ;
                    <https://vocab.noeldemartin.com/crdt/date>
                        "2021-01-04T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            `,
        );
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl }))),
        );
        await localEngine.writeFile(uploadUrl, new Blob(['upload']), {
            localChanges: fileLocalChanges(uploadUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: false,
                    files: [{ strategy: 'document', fields: ['friendUrls'], availableOffline: true }],
                },
            ],
        });

        // Assert
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('ignores local files without files config', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({ ...config, applicationModels: [{ model: User, registration: false }] });

        // Assert
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });
});
