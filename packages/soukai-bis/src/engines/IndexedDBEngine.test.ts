import 'fake-indexeddb/auto';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import IndexedDBEngine from './IndexedDBEngine';

describe('IndexedDBEngine', () => {

    let databaseName: string;
    let engine: IndexedDBEngine;
    let metadataConnection: IDBPDatabase | null = null;
    let containersConnection: IDBPDatabase | null = null;

    beforeEach(async () => {
        databaseName = faker.random.word();
        engine = new IndexedDBEngine(databaseName);

        await resetDatabase();
    });

    afterEach(async () => {
        await engine.close();

        closeConnections();

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
            graph: {
                '@id': `${documentUrl}#it`,
                '@type': expandIRI('foaf:Person'),
                [expandIRI('foaf:name')]: name,
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
            graph: {
                '@id': containerUrl,
                '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
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
            graph: {
                '@id': containerUrl,
                '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
                [expandIRI('rdfs:label')]: name,
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
        expect(documents[0]).toEqual({ url: documentUrl, graph: expect.anything() });

        await expect(documents[0]?.graph).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: newName,
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
        await expect(documents[0]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
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
        await expect(documents[0]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
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

    it('reads parent containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: childContainerUrl });

        await setDatabaseDocument(childContainerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
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
            graph: document,
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

    async function resetDatabase(): Promise<void> {
        await initMetaDatabase();
    }

    async function initMetaDatabase(): Promise<void> {
        if (metadataConnection) {
            return;
        }

        metadataConnection = await openDB(`${databaseName}-meta`, 1, {
            upgrade: (database) => database.createObjectStore('containers', { keyPath: 'url' }),
        });
    }

    function closeConnections(): void {
        if (metadataConnection) {
            metadataConnection.close();
        }

        if (containersConnection) {
            containersConnection.close();
        }

        metadataConnection = null;
        containersConnection = null;
    }

    async function dropDatabases(): Promise<void> {
        await deleteDB(`${databaseName}-meta`);
        await deleteDB(`${databaseName}`);
    }

    async function getDatabaseDocuments(containers: string): Promise<Record<string, unknown>[]> {
        const transaction = await getContainerTransaction(containers, 'readonly');

        return transaction.store.getAll();
    }

    async function setDatabaseDocument(
        containerUrl: string,
        url: string,
        graph: Record<string, unknown>,
        metadata?: { lastModifiedAt?: Date },
    ): Promise<void> {
        const transaction = await getContainerTransaction(containerUrl, 'readwrite');

        transaction.store.put({ url, graph, lastModifiedAt: metadata?.lastModifiedAt });

        await transaction.done;
    }

    async function getContainerTransaction<T extends IDBTransactionMode>(
        containerUrl: string,
        mode: T,
    ): Promise<IDBPTransaction<unknown, [string], T>> {
        if (containersConnection && !containersConnection.objectStoreNames.contains(containerUrl)) {
            containersConnection.close();
            containersConnection = null;
        }

        if (!containersConnection) {
            if (metadataConnection) {
                const transaction = metadataConnection.transaction('containers', 'readwrite');
                const existing = await transaction.store.get(containerUrl);

                if (!existing) {
                    await transaction.store.add({ url: containerUrl });
                }

                await transaction.done;
            }

            const meta = await openDB(`${databaseName}-meta`);
            const containers = await meta.getAll('containers');
            const version = containers.length + 1;

            meta.close();

            containersConnection = await openDB(databaseName, version, {
                upgrade: (database) => {
                    for (const c of containers) {
                        if (!database.objectStoreNames.contains(c.url)) {
                            database.createObjectStore(c.url, { keyPath: 'url' });
                        }
                    }
                },
            });
        }

        return (containersConnection as IDBPDatabase).transaction(containerUrl, mode);
    }

});
