import { expandIRI, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';
import { serializeIDBQuads } from 'soukai-bis/utils/idb-quads';
import type { LocalDocument } from 'soukai-bis/lib/SoukaiIndexedDB';

import IndexedDBEngine from './IndexedDBEngine';

describe('IndexedDBEngine', () => {

    let engine: IndexedDBEngine;

    beforeEach(async () => {
        engine = new IndexedDBEngine();

        await resetDatabase();
    });

    afterEach(async () => {
        await engine.close();
        await dropDatabases();
    });

    it('creates documents', async () => {
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

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

    it('creates containers', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                ],
            },
        });
    });

    it('creates containers with meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const name = faker.name.firstName();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                    { p: expandIRI('rdfs:label'), o: { v: name } },
                ],
            },
        });
    });

    it('fails creating documents when they already exist', async () => {
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
        const createDocument = () =>
            engine.createDocument(documentUrl, {
                '@id': `${documentUrl}#it`,
                '@type': expandIRI('foaf:Person'),
                [expandIRI('foaf:name')]: name,
            });

        // Assert
        await expect(createDocument).rejects.toBeInstanceOf(DocumentAlreadyExists);
    });

    it('updates documents', async () => {
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();
        const newName = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
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

    it('updates containers', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl();

        await setDatabaseDocument(parentUrl, containerUrl, {
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
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                ],
            },
        });
    });

    it('updates containers meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        await setDatabaseDocument(parentUrl, containerUrl, {
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
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                    { p: expandIRI('rdfs:label'), o: { v: name } },
                ],
            },
        });
    });

    it('reads documents', async () => {
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        const document = await engine.readDocument(documentUrl);

        await expect(await quadsToJsonLD(document.getQuads())).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });
    });

    it('reads containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': documentUrl },
        });
    });

    it('reads virtual containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
        const grandchildContainerUrl = fakeContainerUrl({ baseUrl: childContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: grandchildContainerUrl });

        await setDatabaseDocument(grandchildContainerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': childContainerUrl },
        });
    });

    it('reads parent containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: childContainerUrl });

        await setDatabaseDocument(containerUrl, childContainerUrl, { '@id': containerUrl });
        await setDatabaseDocument(childContainerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        expect(container.getQuads()).toHaveLength(3);

        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': childContainerUrl },
        });
    });

    it('reads containers with meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl });
        await setDatabaseDocument(parentUrl, containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': documentUrl },
        });
    });

    it('deletes documents', async () => {
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        await engine.deleteDocument(documentUrl);

        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(0);
    });

    it('creates documents with metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        // Act
        await engine.createDocument(documentUrl, document, { lastModifiedAt });

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: documentUrl,
            containerUrl,
            resources: {},
            lastModifiedAt,
        });
    });

    it('reads documents with metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl }, { lastModifiedAt });

        // Act
        const document = await engine.readDocument(documentUrl);

        // Assert
        expect(document.headers.get('Last-Modified')).toEqual(lastModifiedAt.toUTCString());
    });

    it('updates documents with metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const newLastModifiedAt = new Date('2023-02-01T00:00:00.000Z');

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl }, { lastModifiedAt });

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
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]?.lastModifiedAt).toEqual(newLastModifiedAt);
    });

    it('updating documents clears last modified at', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl }, { lastModifiedAt });

        // Act
        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl: documentUrl,
                property: expandIRI('rdfs:label'),
                value: ['Updated'],
                date: new Date(),
            }),
        ]);

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]?.lastModifiedAt).toBeUndefined();
    });

    it('drops containers', async () => {
        // Arrange
        const containerUrls = [fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl()] as const;
        const documentUrl = fakeDocumentUrl({ containerUrl: containerUrls[0] });

        await setDatabaseDocument(containerUrls[0], documentUrl, {
            '@id': documentUrl,
        });

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

        await engine.close();
    });

    it('gets nested container urls', async () => {
        // Arrange
        const rootContainerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const virtualChildContainerUrl = fakeContainerUrl({ baseUrl: fakeContainerUrl() });

        await setDatabaseDocument(rootContainerUrl, fakeDocumentUrl({ containerUrl: rootContainerUrl }), {});
        await setDatabaseDocument(childContainerUrl, fakeDocumentUrl({ containerUrl: childContainerUrl }), {});
        await setDatabaseDocument(
            virtualChildContainerUrl,
            fakeDocumentUrl({ containerUrl: virtualChildContainerUrl }),
            {},
        );

        // Act
        const containerUrls = await engine.getContainerUrls();

        // Assert
        expect(containerUrls).toHaveLength(3);
        expect(containerUrls).toEqual(
            expect.arrayContaining([rootContainerUrl, childContainerUrl, virtualChildContainerUrl]),
        );
    });

    it('purges metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date();

        await setDatabaseDocument(
            containerUrl,
            documentUrl,
            {
                '@id': documentUrl,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );

        const initialDocuments = await getDatabaseDocuments(containerUrl);
        expect(initialDocuments[0]?.lastModifiedAt).toEqual(lastModifiedAt);

        // Act
        await engine.purgeMetadata();

        // Assert
        const purgedDocuments = await getDatabaseDocuments(containerUrl);
        expect(purgedDocuments[0]?.lastModifiedAt).toBeUndefined();
    });

    it('gets document urls', async () => {
        // Arrange
        const containerUrl = 'http://localhost:3000/alice/movies/';
        const firstUrl = `${containerUrl}first`;
        const secondUrl = `${containerUrl}second`;
        const lastModifiedAt = new Date();

        await engine.createDocument(
            firstUrl,
            {
                '@id': firstUrl,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );
        await engine.createDocument(secondUrl, {
            '@id': secondUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        // Act & Assert
        const allUrls = await engine.getDocumentUrls();
        expect(allUrls).toContain(firstUrl);
        expect(allUrls).toContain(secondUrl);

        const unsyncedUrls = await engine.getDocumentUrls({ metadata: { lastModifiedAt: null } });
        expect(unsyncedUrls).not.toContain(firstUrl);
        expect(unsyncedUrls).toContain(secondUrl);

        const syncedUrls = await engine.getDocumentUrls({ metadata: { lastModifiedAt } });
        expect(syncedUrls).toContain(firstUrl);
        expect(syncedUrls).not.toContain(secondUrl);
    });

    it('gets documents last modified at', async () => {
        // Arrange
        const firstUrl = fakeDocumentUrl();
        const secondUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date();

        await engine.createDocument(
            firstUrl,
            {
                '@id': firstUrl,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );
        await engine.createDocument(secondUrl, {
            '@id': secondUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        // Act
        const timestamps = await engine.getDocumentsLastModifiedAt();

        // Assert
        expect(timestamps[firstUrl]).toBeInstanceOf(Date);
        expect(timestamps[firstUrl]?.getTime()).toBe(lastModifiedAt.getTime());
        expect(timestamps[secondUrl]).toBeNull();
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

        // Assert
        expect(Object.keys(documents)).toHaveLength(7);
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

        // Assert
        expect(Object.keys(documents)).toHaveLength(6);
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

    async function resetDatabase(): Promise<void> {
        await SoukaiIndexedDB.clear();
        await SoukaiIndexedDB.connect();
    }

    async function dropDatabases(): Promise<void> {
        await SoukaiIndexedDB.clear();
    }

    async function getDatabaseDocuments(containerUrl: string): Promise<LocalDocument[]> {
        const db = await SoukaiIndexedDB.connect();
        const documents = await db.getAllFromIndex('documents', 'containerUrl', containerUrl);

        for (const doc of documents) {
            if (doc.lastModifiedAt !== undefined) {
                continue;
            }

            delete doc.lastModifiedAt;
        }

        return documents;
    }

    async function setDatabaseDocument(
        containerUrl: string,
        url: string,
        graph: Record<string, unknown>,
        metadata?: { lastModifiedAt?: Date },
    ): Promise<void> {
        const db = await SoukaiIndexedDB.connect();
        const transaction = db.transaction(['containers', 'documents'], 'readwrite');
        const container = await transaction.objectStore('containers').get(containerUrl);

        if (!container) {
            await transaction.objectStore('containers').add({ url: containerUrl });
        }

        const quads = await jsonldToQuads(graph);
        const resources = serializeIDBQuads(quads);

        await transaction.objectStore('documents').put({
            url,
            containerUrl,
            resources,
            lastModifiedAt: metadata?.lastModifiedAt,
        });

        await transaction.done;
    }

});
