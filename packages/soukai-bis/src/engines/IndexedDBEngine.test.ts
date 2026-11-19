import { faker } from '@noeldemartin/faker';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS } from 'soukai-bis/lib/internals/rdf';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';
import DeleteResourceOperation from './operations/DeleteResourceOperation';
import { getDatabaseDocuments, setDatabaseDocument } from './testing/helpers';

describe('IndexedDBEngine', () => {
    let engine: IndexedDBEngine;

    beforeEach(() => {
        engine = new IndexedDBEngine();
    });

    it('creates documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        // Act
        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: documentUrl,
            containerUrl,
            resources: {
                [`${documentUrl}#it`]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: expandIRI('foaf:Person') },
                    { p: expandIRI('foaf:name'), o: { v: name } },
                ],
            },
        });
    });

    it('updates documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();
        const newName = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        // Act
        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl: `${documentUrl}#it`,
                property: expandIRI('foaf:name'),
                value: [newName],
                date: new Date(),
            }),
        ]);

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: documentUrl,
            containerUrl,
            resources: {
                [`${documentUrl}#it`]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: expandIRI('foaf:Person') },
                    { p: expandIRI('foaf:name'), o: { v: newName } },
                ],
            },
        });
    });

    it('reads documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        // Act
        const document = await engine.readDocument(documentUrl);

        // Assert
        await expect(await quadsToJsonLD(document.getQuads())).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });
    });

    it('deletes documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        // Act
        await engine.deleteDocument(documentUrl);

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(0);
    });

    it('reads deep documents', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const rootContainerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const show1ContainerUrl = `${rootContainerUrl}show1/`;
        const show2ContainerUrl = `${rootContainerUrl}show2/`;
        const season1ContainerUrl = `${show1ContainerUrl}season1/`;
        const show1MetadataDocumentUrl = `${show1ContainerUrl}metadata`;
        const show1MetadataResourceUrl = `${show1MetadataDocumentUrl}#it`;
        const season1Episode1DocumentUrl = `${season1ContainerUrl}episode1`;
        const season1Episode1ResourceUrl = `${season1Episode1DocumentUrl}#it`;
        const show2Episode1DocumentUrl = `${show2ContainerUrl}episode1`;
        const show2Episode1ResourceUrl = `${show2Episode1DocumentUrl}#it`;

        await setDatabaseDocument(parentUrl, rootContainerUrl, {
            '@id': rootContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(show1ContainerUrl, season1ContainerUrl, {
            '@id': season1ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(rootContainerUrl, show2ContainerUrl, {
            '@id': show2ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(show1ContainerUrl, show1MetadataDocumentUrl, {
            '@id': show1MetadataResourceUrl,
            '@type': 'https://vocab.noeldemartin.com/crdt/Metadata',
        });

        await setDatabaseDocument(season1ContainerUrl, season1Episode1DocumentUrl, {
            '@id': season1Episode1ResourceUrl,
            '@type': 'https://schema.org/Episode',
        });

        await setDatabaseDocument(show2ContainerUrl, show2Episode1DocumentUrl, {
            '@id': show2Episode1ResourceUrl,
            '@type': 'https://schema.org/Episode',
        });

        // Act
        const documents = await engine.readDocuments({ containerUrl: rootContainerUrl, deep: true });
        const documentsCount = await engine.countDocuments({ containerUrl: rootContainerUrl, deep: true });

        // Assert
        expect(Object.keys(documents)).toHaveLength(7);
        expect(documentsCount).toEqual(7);
        expect(Object.keys(documents)).toEqual(
            expect.arrayContaining([
                rootContainerUrl,
                show1ContainerUrl,
                show2ContainerUrl,
                season1ContainerUrl,
                show1MetadataDocumentUrl,
                season1Episode1DocumentUrl,
                show2Episode1DocumentUrl,
            ]),
        );

        const rootJsonLD = await quadsToJsonLD(documents[rootContainerUrl]?.statements(rootContainerUrl) ?? []);
        const show1JsonLD = await quadsToJsonLD(documents[show1ContainerUrl]?.statements(show1ContainerUrl) ?? []);
        const show2JsonLD = await quadsToJsonLD(documents[show2ContainerUrl]?.statements(show2ContainerUrl) ?? []);
        const season1JsonLD = await quadsToJsonLD(
            documents[season1ContainerUrl]?.statements(season1ContainerUrl) ?? [],
        );
        const show1MetadataJsonLD = await quadsToJsonLD(
            documents[show1MetadataDocumentUrl]?.statements(show1MetadataResourceUrl) ?? [],
        );
        const season1Episode1JsonLD = await quadsToJsonLD(
            documents[season1Episode1DocumentUrl]?.statements(season1Episode1ResourceUrl) ?? [],
        );
        const show2Episode1JsonLD = await quadsToJsonLD(
            documents[show2Episode1DocumentUrl]?.statements(show2Episode1ResourceUrl) ?? [],
        );

        await expect(rootJsonLD).toEqualJsonLD({
            '@id': rootContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: [{ '@id': show1ContainerUrl }, { '@id': show2ContainerUrl }],
        });

        await expect(show1JsonLD).toEqualJsonLD({
            '@id': show1ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: [{ '@id': show1MetadataDocumentUrl }, { '@id': season1ContainerUrl }],
        });

        await expect(show2JsonLD).toEqualJsonLD({
            '@id': show2ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: [{ '@id': show2Episode1DocumentUrl }],
        });

        await expect(season1JsonLD).toEqualJsonLD({
            '@id': season1ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: [{ '@id': season1Episode1DocumentUrl }],
        });

        await expect(show1MetadataJsonLD).toEqualJsonLD({
            '@id': show1MetadataResourceUrl,
            '@type': 'https://vocab.noeldemartin.com/crdt/Metadata',
        });

        await expect(season1Episode1JsonLD).toEqualJsonLD({
            '@id': season1Episode1ResourceUrl,
            '@type': 'https://schema.org/Episode',
        });

        await expect(show2Episode1JsonLD).toEqualJsonLD({
            '@id': show2Episode1ResourceUrl,
            '@type': 'https://schema.org/Episode',
        });
    });

    it('reads deep documents with a specific depth', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const rootContainerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const show1ContainerUrl = `${rootContainerUrl}show1/`;
        const show2ContainerUrl = `${rootContainerUrl}show2/`;
        const season1ContainerUrl = `${show1ContainerUrl}season1/`;
        const show1MetadataDocumentUrl = `${show1ContainerUrl}metadata`;
        const show1MetadataResourceUrl = `${show1MetadataDocumentUrl}#it`;
        const season1Episode1DocumentUrl = `${season1ContainerUrl}episode1`;
        const season1Episode1ResourceUrl = `${season1Episode1DocumentUrl}#it`;
        const show2Episode1DocumentUrl = `${show2ContainerUrl}episode1`;
        const show2Episode1ResourceUrl = `${show2Episode1DocumentUrl}#it`;

        await setDatabaseDocument(parentUrl, rootContainerUrl, {
            '@id': rootContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(show1ContainerUrl, season1ContainerUrl, {
            '@id': season1ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(rootContainerUrl, show2ContainerUrl, {
            '@id': show2ContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(show1ContainerUrl, show1MetadataDocumentUrl, {
            '@id': show1MetadataResourceUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        await setDatabaseDocument(season1ContainerUrl, season1Episode1DocumentUrl, {
            '@id': season1Episode1ResourceUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        await setDatabaseDocument(show2ContainerUrl, show2Episode1DocumentUrl, {
            '@id': show2Episode1ResourceUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        // Act
        const documents = await engine.readDocuments({ containerUrl: rootContainerUrl, depth: 1 });
        const documentsCount = await engine.countDocuments({ containerUrl: rootContainerUrl, depth: 1 });

        // Assert
        expect(Object.keys(documents)).toHaveLength(6);
        expect(documentsCount).toEqual(6);
        expect(Object.keys(documents)).toEqual(
            expect.arrayContaining([
                rootContainerUrl,
                show1ContainerUrl,
                show2ContainerUrl,
                season1ContainerUrl,
                show1MetadataDocumentUrl,
                show2Episode1DocumentUrl,
            ]),
        );
    });

    it('reads documents in batches', async () => {
        // Arrange
        const rootContainerUrl = fakeContainerUrl();
        const showContainerUrl = `${rootContainerUrl}show/`;
        const showEpisodeDocumentUrl = `${showContainerUrl}episode`;
        const movieDocumentUrls = Array.from({ length: 60 }, (_, index) => `${rootContainerUrl}movie-${index}`);

        await setDatabaseDocument(rootContainerUrl, showContainerUrl, {
            '@id': showContainerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        await setDatabaseDocument(showContainerUrl, showEpisodeDocumentUrl, {
            '@id': `${showEpisodeDocumentUrl}#it`,
            '@type': 'https://schema.org/Episode',
        });

        for (const url of movieDocumentUrls) {
            await setDatabaseDocument(rootContainerUrl, url, {
                '@id': `${url}#it`,
                '@type': 'https://schema.org/Movie',
            });
        }

        // Act
        const batches: Record<string, unknown>[] = [];

        for await (const batch of engine.readDocumentsInBatches(rootContainerUrl, { depth: 1 })) {
            batches.push(batch);
        }

        // Assert
        const documents = await engine.readDocuments({ containerUrl: rootContainerUrl, depth: 1 });
        const batchedDocuments = Object.assign({}, ...batches) as typeof documents;

        expect(batches.map((batch) => Object.keys(batch).length)).toEqual([50, 13]);
        expect(Object.keys(batchedDocuments).sort()).toEqual(Object.keys(documents).sort());

        for (const [url, document] of Object.entries(documents)) {
            const batchedJsonLD = await quadsToJsonLD(batchedDocuments[url]?.statements() ?? []);

            await expect(batchedJsonLD).toEqualJsonLD(await quadsToJsonLD(document.statements()));
        }
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

    it('deletes documents only when they are empty', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const emptyDocumentUrl = fakeDocumentUrl({ containerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });

        await engine.createDocument(emptyDocumentUrl, [], {
            localChanges: () => ({ resources: { [`${emptyDocumentUrl}#it`]: { deletedAt: new Date() } } }),
        });
        await engine.createDocument(documentUrl, { '@id': `${documentUrl}#it`, '@type': expandIRI('foaf:Person') });

        // Act
        await engine.deleteDocument(emptyDocumentUrl, { ifMatch: { status: 'empty' } });
        const deletingDocument = engine.deleteDocument(documentUrl, { ifMatch: { status: 'empty' } });

        // Assert
        await expect(deletingDocument).rejects.toThrow(PreconditionFailed);
        expect(await engine.readDocumentIfExists(emptyDocumentUrl, { includeEmptyDocuments: true })).toBeNull();
        expect(await engine.getDocumentLocalChanges(emptyDocumentUrl)).toBeNull();
        expect(await engine.readDocumentIfExists(documentUrl)).not.toBeNull();
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
                [documentUrl, otherDocumentUrl].sort(),
                [otherDocumentUrl],
                [],
            ]);
        } finally {
            removeListener();
        }
    });
});
