import { faker } from '@noeldemartin/faker';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import InMemoryEngine from './InMemoryEngine';
import DeleteResourceOperation from './operations/DeleteResourceOperation';

describe('InMemoryEngine', () => {
    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();
    });

    it('creates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        await engine.createDocument(documentUrl, document);

        expect(engine.documents[documentUrl]?.graph).toEqual(document);
    });

    it('creates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(engine.documents[containerUrl]?.graph).toEqual({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
    });

    it('creates containers with meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const name = faker.name.firstName();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(engine.documents[containerUrl]?.graph).toEqual({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });
    });

    it('fails creating documents when they already exist', async () => {
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(documentUrl, {});

        await expect(engine.createDocument(documentUrl, {})).rejects.toBeInstanceOf(DocumentAlreadyExists);
    });

    it('creates documents in containers', async () => {
        const containerUrl = fakeContainerUrl();
        const documentUrl = `${containerUrl}document`;

        const document = await engine.createDocumentInContainer(containerUrl, documentUrl, {});

        expect(document.url).toEqual(documentUrl);
        expect(engine.documents[documentUrl]).toBeDefined();
    });

    it('fails creating documents in containers with invalid urls', async () => {
        const containerUrl = fakeContainerUrl();

        await expect(engine.createDocumentInContainer(containerUrl, `${containerUrl}child/`, {})).rejects.toThrow(
            SoukaiError,
        );
        await expect(engine.createDocumentInContainer(containerUrl, `${containerUrl}child/doc`, {})).rejects.toThrow(
            SoukaiError,
        );
        await expect(engine.createDocumentInContainer(containerUrl, fakeDocumentUrl(), {})).rejects.toThrow(
            SoukaiError,
        );
        await expect(engine.createDocumentInContainer(containerUrl, containerUrl, {})).rejects.toThrow(SoukaiError);
    });

    it('updates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const newName = faker.name.firstName();

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl: `${documentUrl}#it`,
                property: expandIRI('foaf:name'),
                value: [newName],
                date: new Date(),
            }),
        ]);

        await expect(engine.documents[documentUrl]?.graph).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: newName,
        });
    });

    it('updates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
    });

    it('updates containers meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: faker.name.firstName(),
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: expandIRI('rdfs:label'),
                value: [name],
                date: new Date(),
            }),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });
    });

    it('reads documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        engine.documents[documentUrl] = { graph: document };

        // Act
        const readDocument = await engine.readDocument(documentUrl);

        // Assert
        await expect(await quadsToJsonLD(readDocument.getQuads())).toEqualJsonLD(document);
    });

    it('reads containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        engine.documents[containerUrl] = {
            graph: { '@id': containerUrl, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] },
        };
        engine.documents[documentUrl] = { graph: { '@id': documentUrl } };

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        expect(container.getQuads()).toHaveLength(3);

        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: {
                '@id': documentUrl,
            },
        });
    });

    it('deletes documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        await engine.createDocument(documentUrl, document);

        await engine.deleteDocument(documentUrl);

        expect(engine.documents[documentUrl]).toBeUndefined();
    });

    it('deletes documents only when they are empty', async () => {
        // Arrange
        const emptyDocumentUrl = fakeDocumentUrl();
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(emptyDocumentUrl, []);
        await engine.createDocument(documentUrl, { '@id': `${documentUrl}#it`, '@type': expandIRI('foaf:Person') });

        // Act
        await engine.deleteDocument(emptyDocumentUrl, { ifMatch: { status: 'empty' } });
        const deletingDocument = engine.deleteDocument(documentUrl, { ifMatch: { status: 'empty' } });

        // Assert
        await expect(deletingDocument).rejects.toThrow(PreconditionFailed);
        expect(engine.documents[emptyDocumentUrl]).toBeUndefined();
        expect(engine.documents[documentUrl]).toBeDefined();
    });

    it('fails deleting missing documents', async () => {
        // Act & Assert
        await expect(engine.deleteDocument(fakeDocumentUrl())).rejects.toThrow(DocumentNotFound);
    });

    it('creates documents with metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        // Act
        await engine.createDocument(documentUrl, document, { lastModifiedAt });

        // Assert
        expect(engine.documents[documentUrl]?.lastModifiedAt).toEqual(lastModifiedAt);
    });

    it('updates documents with metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const newLastModifiedAt = new Date('2023-02-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        await engine.createDocument(documentUrl, document, { lastModifiedAt });

        // Act
        await engine.updateDocument(
            documentUrl,
            [
                new SetPropertyOperation({
                    resourceUrl: documentUrl,
                    property: expandIRI('rdfs:label'),
                    value: ['Updated'],
                    date: new Date(),
                }),
            ],
            { lastModifiedAt: newLastModifiedAt },
        );

        // Assert
        expect(engine.documents[documentUrl]?.lastModifiedAt).toEqual(newLastModifiedAt);
    });

    it('gets nested container urls', async () => {
        // Arrange
        const rootContainerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const virtualChildContainerUrl = fakeContainerUrl({ baseUrl: fakeContainerUrl() });

        await engine.createDocument(fakeDocumentUrl({ containerUrl: rootContainerUrl }), {});
        await engine.createDocument(fakeDocumentUrl({ containerUrl: childContainerUrl }), {});
        await engine.createDocument(fakeDocumentUrl({ containerUrl: virtualChildContainerUrl }), {});

        // Act
        const containerUrls = await engine.getContainerUrls();

        // Assert
        expect(containerUrls).toHaveLength(3);
        expect(containerUrls).toEqual(
            expect.arrayContaining([rootContainerUrl, childContainerUrl, virtualChildContainerUrl]),
        );
    });

    it('gets documents last modified at', async () => {
        // Arrange
        const firstUrl = fakeDocumentUrl();
        const secondUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date();

        await engine.createDocument(firstUrl, { '@id': firstUrl }, { lastModifiedAt });
        await engine.createDocument(secondUrl, { '@id': secondUrl });

        // Act
        const timestamps = await engine.getDocumentsLastModifiedAt();

        // Assert
        expect(timestamps[firstUrl]).toBeInstanceOf(Date);
        expect(timestamps[firstUrl]?.getTime()).toBe(lastModifiedAt.getTime());
        expect(timestamps[secondUrl]).toBeNull();
    });

    it('drops containers', async () => {
        // Arrange
        const containerUrls = [fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl()] as const;
        const documentUrl = fakeDocumentUrl({ containerUrl: containerUrls[0] });

        await engine.createDocument(documentUrl, { '@id': documentUrl });
        await engine.createDocument(containerUrls[1], {
            '@id': containerUrls[1],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[2], {
            '@id': containerUrls[2],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[3], {
            '@id': containerUrls[3],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.dropContainers([containerUrls[0], containerUrls[1]]);

        // Assert
        await expect(engine.readDocument(documentUrl)).rejects.toBeInstanceOf(DocumentNotFound);
    });

    it('hides empty documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
        });

        // Act
        await engine.updateDocument(documentUrl, [new DeleteResourceOperation(`${documentUrl}#it`)]);

        // Assert
        const container = await engine.readDocument(containerUrl);
        const rawContainer = await engine.readDocument(containerUrl, { includeEmptyDocuments: true });
        const rawDocument = await engine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(await engine.readDocumentIfExists(documentUrl)).toBeNull();
        expect(rawDocument.getQuads()).toHaveLength(0);
        expect(container.contains(containerUrl, 'ldp:contains', documentUrl)).toBe(false);
        expect(rawContainer.contains(containerUrl, 'ldp:contains', documentUrl)).toBe(true);
    });

    it('removes local changes with documents and containers', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl({ containerUrl: fakeContainerUrl() });
        const otherContainerUrl = fakeContainerUrl();
        const otherDocumentUrl = fakeDocumentUrl({ containerUrl: otherContainerUrl });
        const created = (url: string) => () => ({
            resources: { [`${url}#it`]: { createdAt: new Date() } },
        });

        await engine.createDocument(
            documentUrl,
            { '@id': `${documentUrl}#it` },
            { localChanges: created(documentUrl) },
        );
        await engine.createDocument(
            otherDocumentUrl,
            { '@id': `${otherDocumentUrl}#it` },
            { localChanges: created(otherDocumentUrl) },
        );

        // Act
        await engine.deleteDocument(documentUrl);
        await engine.dropContainers([otherContainerUrl]);

        // Assert
        expect(await engine.getDocumentLocalChanges(documentUrl)).toBeNull();
        expect(await engine.getDocumentLocalChanges(otherDocumentUrl)).toBeNull();
        expect(await engine.getDocumentsLocalChanges()).toEqual({});
    });

    it('notifies local changes updates', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl({ containerUrl: fakeContainerUrl() });
        const otherContainerUrl = fakeContainerUrl();
        const otherDocumentUrl = fakeDocumentUrl({ containerUrl: otherContainerUrl });
        const created = (url: string) => () => ({
            resources: { [`${url}#it`]: { createdAt: new Date() } },
        });
        const notifications: string[][] = [];
        const removeListener = engine.listeners.add({
            onLocalChangesUpdated: async (localEngine) =>
                notifications.push(Object.keys(await localEngine.getDocumentsLocalChanges())),
        });

        try {
            // Act
            await engine.createDocument(documentUrl, { '@id': `${documentUrl}#it` });
            await engine.createDocument(
                otherDocumentUrl,
                { '@id': `${otherDocumentUrl}#it` },
                { localChanges: created(otherDocumentUrl) },
            );
            await engine.updateDocument(documentUrl, [], { localChanges: created(documentUrl) });
            await engine.updateDocument(documentUrl, [], { localChanges: created(documentUrl) });
            await engine.deleteDocument(documentUrl);
            await engine.dropContainers([otherContainerUrl]);

            // Assert
            expect(notifications).toEqual([
                [otherDocumentUrl],
                [otherDocumentUrl, documentUrl],
                [otherDocumentUrl],
                [],
            ]);
        } finally {
            removeListener();
        }
    });
});
