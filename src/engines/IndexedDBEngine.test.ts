import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { faker } from '@noeldemartin/faker';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

import { bootModels } from '@/models';

import { IndexedDBEngine } from '@/engines/IndexedDBEngine';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';

import User from '@/testing/stubs/User';

describe('IndexedDBEngine', () => {

    let databaseName: string;
    let databaseCollections: string[];
    let engine: IndexedDBEngine;
    let metadataConnection: IDBPDatabase | null = null;
    let collectionsConnection: IDBPDatabase | null = null;

    beforeEach(async () => {
        bootModels({ User });

        databaseName = faker.random.word();
        databaseCollections = [User.collection];
        engine = new IndexedDBEngine(databaseName);

        await resetDatabase();
    });

    afterEach(async () => {
        engine.closeConnections();
        closeConnections();

        await dropDatabases();
    });

    it('testSchema', async () => {
        // Arrange
        const collections = [
            faker.company.name(),
            faker.company.name(),
            faker.company.name(),
        ];

        closeConnections();
        await dropDatabases();

        // Act
        for (const collection of collections) {
            await engine.create(collection, {});
        }

        engine.closeConnections();

        // Assert
        const metadataConnection = await openDB(`soukai-${databaseName}-meta`, 1);
        const documentsConnection = await openDB(`soukai-${databaseName}`, 1000);
        const metadataCollections = await metadataConnection.transaction('collections', 'readonly').store.getAll();

        const documentStores: string[] = [];
        for (let i = 0; i < documentsConnection.objectStoreNames.length; i++) {
            documentStores.push(documentsConnection.objectStoreNames.item(i) as string);
        }

        metadataConnection.close();
        documentsConnection.close();

        for (const collection of collections) {
            expect(metadataCollections.find(metadataCollection => metadataCollection.name === collection)).toBeTruthy();
            expect(documentStores.indexOf(collection)).not.toEqual(-1);
        }
    });

    it('testCreate', async () => {
        // Arrange
        const name = faker.name.firstName();

        // Act
        const id = await engine.create(User.collection, { name });

        // Assert
        expect(await getDatabaseDocuments(User.collection)).toHaveLength(1);

        const user = await getDatabaseDocument(User.collection, id);
        expect(user).not.toBeNull();
        expect(user.name).toEqual(name);
    });

    it('testCreateExistent', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        setDatabaseDocument(User.collection, id, { name });

        // Assert
        await expect(engine.create(User.collection, { name }, id)).rejects.toThrow(DocumentAlreadyExists);
    });

    it('testReadOne', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        setDatabaseDocument(User.collection, id, { name });

        // Act
        const document = await engine.readOne(User.collection, id);

        // Assert
        expect(document).toEqual({ name });
    });

    it('testReadOneNonExistent', async () => {
        await expect(engine.readOne(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testReadMany', async () => {
        // Arrange
        const firstId = faker.datatype.uuid();
        const firstName = faker.name.firstName();
        const secondId = faker.datatype.uuid();
        const secondName = faker.name.firstName();

        setDatabaseDocument(User.collection, firstId, { name: firstName });
        setDatabaseDocument(User.collection, secondId, { name: secondName });

        // Act
        const documents = await engine.readMany(User.collection);

        // Assert
        expect(Object.values(documents)).toHaveLength(2);
        expect(documents[firstId]).toEqual({ name: firstName });
        expect(documents[secondId]).toEqual({ name: secondName });
    });

    it('testReadManyFilters', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        setDatabaseDocument(User.collection, id, { name });
        setDatabaseDocument(User.collection, faker.datatype.uuid(), { name: faker.name.firstName() });

        // Act
        const documents = await engine.readMany(User.collection, { name });

        // Assert
        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    });

    it('testUpdate', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number();

        setDatabaseDocument(User.collection, id, { name: initialName, surname: faker.name.lastName(), age });

        // Act
        await engine.update(User.collection, id, { name: newName, surname: { $unset: true } });

        // Assert
        const user = await getDatabaseDocument(User.collection, id);

        expect(user).toEqual({ name: newName, age });
    });

    it('testUpdateNonExistent', async () => {
        await expect(engine.update(User.collection, faker.datatype.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    });

    it('testDelete', async () => {
        // Arrange
        const firstId = faker.datatype.uuid();
        const secondId = faker.datatype.uuid();
        const name = faker.name.firstName();

        setDatabaseDocument(User.collection, firstId, { name: faker.name.firstName() });
        setDatabaseDocument(User.collection, secondId, { name });

        // Act
        await engine.delete(User.collection, firstId);

        // Assert
        const users = await getDatabaseDocuments(User.collection);

        expect(users).toHaveLength(1);
        expect(users[0]).toEqual({ name });
    });

    it('testDeleteNonExistent', async () => {
        await expect(engine.delete(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testDeleteNonExistentCollection', async () => {
        await expect(engine.delete(faker.random.word(), faker.datatype.uuid()))
            .rejects.toThrow(DocumentNotFound);
    });

    async function resetDatabase(): Promise<void> {
        await initMetaDatabase();
        await initCollectionsDatabase();
    }

    async function initMetaDatabase(): Promise<void> {
        if (metadataConnection) {
            return;
        }

        metadataConnection = await openDB(`soukai-${databaseName}-meta`, 1, {
            upgrade: database => database.createObjectStore('collections', { keyPath: 'name' }),
        });

        const transaction = metadataConnection.transaction('collections', 'readwrite');

        for (const collection of databaseCollections) {
            transaction.store.add({ name: collection });
        }

        await transaction.done;
    }

    async function initCollectionsDatabase(): Promise<void> {
        if (collectionsConnection) {
            return;
        }

        collectionsConnection = await openDB(`soukai-${databaseName}`, databaseCollections.length, {
            upgrade: database => {
                for (const collection of databaseCollections) {
                    database.createObjectStore(collection);
                }
            },
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
        await deleteDB(`soukai-${databaseName}-meta`);
        await deleteDB(`soukai-${databaseName}`);
    }

    function getDatabaseDocument(collection: string, id: string): Promise<Record<string, unknown>> {
        const transaction = getCollectionTransaction(collection, 'readonly');

        return transaction.store.get(id);
    }

    function getDatabaseDocuments(collection: string): Promise<Record<string, unknown>[]> {
        const transaction = getCollectionTransaction(collection, 'readonly');

        return transaction.store.getAll();
    }

    async function setDatabaseDocument(
        collection: string,
        id: string,
        document: Record<string, unknown>,
    ): Promise<void> {
        const transaction = getCollectionTransaction(collection, 'readwrite');

        transaction.store.put(document, id);

        await transaction.done;
    }

    function getCollectionTransaction(
        collection: string,
        mode: IDBTransactionMode,
    ): IDBPTransaction<unknown, [string]> {
        return (collectionsConnection as IDBPDatabase).transaction(collection, mode);
    }

});
