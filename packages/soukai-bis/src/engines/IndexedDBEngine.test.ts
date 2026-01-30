import 'fake-indexeddb/auto';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import IndexedDBEngine from './IndexedDBEngine';

describe('IndexedDBEngine', () => {

    let databaseName: string;
    let engine: IndexedDBEngine;
    let metadataConnection: IDBPDatabase | null = null;
    let collectionsConnection: IDBPDatabase | null = null;

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

    async function resetDatabase(): Promise<void> {
        await initMetaDatabase();
    }

    async function initMetaDatabase(): Promise<void> {
        if (metadataConnection) {
            return;
        }

        metadataConnection = await openDB(`${databaseName}-meta`, 1, {
            upgrade: (database) => database.createObjectStore('collections', { keyPath: 'name' }),
        });
    }

    function closeConnections(): void {
        if (metadataConnection) {
            metadataConnection.close();
        }

        if (collectionsConnection) {
            collectionsConnection.close();
        }

        metadataConnection = null;
        collectionsConnection = null;
    }

    async function dropDatabases(): Promise<void> {
        await deleteDB(`${databaseName}-meta`);
        await deleteDB(`${databaseName}`);
    }

    async function getDatabaseDocuments(collection: string): Promise<Record<string, unknown>[]> {
        const transaction = await getCollectionTransaction(collection, 'readonly');

        return transaction.store.getAll();
    }

    async function setDatabaseDocument(collection: string, url: string, graph: Record<string, unknown>): Promise<void> {
        const transaction = await getCollectionTransaction(collection, 'readwrite');

        transaction.store.put({ url, graph });

        await transaction.done;
    }

    async function getCollectionTransaction<T extends IDBTransactionMode>(
        collection: string,
        mode: T,
    ): Promise<IDBPTransaction<unknown, [string], T>> {
        if (collectionsConnection && !collectionsConnection.objectStoreNames.contains(collection)) {
            collectionsConnection.close();
            collectionsConnection = null;
        }

        if (!collectionsConnection) {
            if (metadataConnection) {
                const transaction = metadataConnection.transaction('collections', 'readwrite');
                const existing = await transaction.store.get(collection);

                if (!existing) {
                    await transaction.store.add({ name: collection });
                }

                await transaction.done;
            }

            const meta = await openDB(`${databaseName}-meta`);
            const collections = await meta.getAll('collections');
            const version = collections.length + 1;

            meta.close();

            collectionsConnection = await openDB(databaseName, version, {
                upgrade: (database) => {
                    for (const c of collections) {
                        if (!database.objectStoreNames.contains(c.name)) {
                            database.createObjectStore(c.name, { keyPath: 'url' });
                        }
                    }
                },
            });
        }

        return (collectionsConnection as IDBPDatabase).transaction(collection, mode);
    }

});
