import 'fake-indexeddb/auto';
import { RDFLiteral, RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';

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
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        });

        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: documentUrl,
            graph: {
                '@id': `${documentUrl}#it`,
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                'http://xmlns.com/foaf/0.1/name': name,
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
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        });

        // Act
        const createDocument = () =>
            engine.createDocument(documentUrl, {
                '@id': `${documentUrl}#it`,
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                'http://xmlns.com/foaf/0.1/name': name,
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
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        });

        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation(
                new RDFNamedNode(`${documentUrl}#it`),
                new RDFNamedNode(expandIRI('foaf:name')),
                new RDFLiteral(newName),
            ),
        ]);

        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({ url: documentUrl, graph: expect.anything() });

        await expect(documents[0]?.graph).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': newName,
        });
    });

    it('reads many documents', async () => {
        const containerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl });
        const firstName = faker.name.firstName();
        const secondName = faker.name.firstName();

        await setDatabaseDocument(containerUrl, firstDocumentUrl, {
            '@id': `${firstDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': firstName,
        });

        await setDatabaseDocument(containerUrl, secondDocumentUrl, {
            '@id': `${secondDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': secondName,
        });

        const documents = await engine.readManyDocuments(containerUrl);

        expect(Object.keys(documents)).toHaveLength(2);
        expect(documents[firstDocumentUrl]).toEqual({
            '@id': `${firstDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': firstName,
        });
        expect(documents[secondDocumentUrl]).toEqual({
            '@id': `${secondDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': secondName,
        });
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
