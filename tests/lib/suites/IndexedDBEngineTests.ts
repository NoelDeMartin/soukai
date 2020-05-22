import 'fake-indexeddb/auto';

import Faker from 'faker';
import { deleteDB, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

import Soukai from '@/Soukai';

import IndexedDBEngine from '@/engines/IndexedDBEngine';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';

import TestSuite from '../TestSuite';

import User from '../stubs/User';

export default class extends TestSuite {

    public static title: string = 'IndexedDB';

    private databaseName: string;
    private databaseCollections: string[];
    private engine: IndexedDBEngine;
    private metadataConnection: IDBPDatabase;
    private collectionsConnection: IDBPDatabase;

    public async setUp(): Promise<void> {
        Soukai.loadModels({ User });

        this.databaseName = Faker.random.word();
        this.databaseCollections = [User.collection];
        this.engine = new IndexedDBEngine(this.databaseName);

        await this.resetDatabase();
    }

    public async tearDown(): Promise<void> {
        this.engine.closeConnections();
        this.closeConnections();

        await this.dropDatabases();
    }

    public async testSchema(): Promise<void> {
        // Arrange
        const collections = [
            Faker.company.companyName(),
            Faker.company.companyName(),
            Faker.company.companyName(),
        ];

        this.closeConnections();
        await this.dropDatabases();

        // Act
        for (const collection of collections) {
            await this.engine.create(collection, {});
        }

        this.engine.closeConnections();

        // Assert
        const metadataConnection = await openDB(`${this.databaseName}-meta`, 1);
        const documentsConnection = await openDB(this.databaseName, 1000);
        const metadataCollections = await metadataConnection.transaction('collections', 'readonly').store.getAll();

        const documentStores: string[] = [];
        for (let i = 0; i < documentsConnection.objectStoreNames.length; i++) {
            documentStores.push(documentsConnection.objectStoreNames.item(i)!);
        }

        metadataConnection.close();
        documentsConnection.close();

        for (const collection of collections) {
            expect(metadataCollections.find(metadataCollection => metadataCollection.name === collection)).toBeTruthy();
            expect(documentStores.indexOf(collection)).not.toEqual(-1);
        }
    }

    public async testCreate(): Promise<void> {
        // Arrange
        const name = Faker.name.firstName();

        // Act
        const id = await this.engine.create(User.collection, { name });

        // Assert
        expect(await this.getDatabaseDocuments(User.collection)).toHaveLength(1);

        const user = await this.getDatabaseDocument(User.collection, id);
        expect(user).not.toBeNull();
        expect(user.name).toEqual(name);
    }

    public async testCreateExistent(): Promise<void> {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.setDatabaseDocument(User.collection, id, { name });

        // Assert
        await expect(this.engine.create(User.collection, { name }, id)).rejects.toThrow(DocumentAlreadyExists);
    }

    public async testReadOne(): Promise<void> {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.setDatabaseDocument(User.collection, id, { name });

        // Act
        const document = await this.engine.readOne(User.collection, id);

        // Assert
        expect(document).toEqual({ name });
    }

    public async testReadOneNonExistent(): Promise<void> {
        await expect(this.engine.readOne(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

    public async testReadMany(): Promise<void> {
        // Arrange
        const firstId = Faker.random.uuid();
        const firstName = Faker.name.firstName();
        const secondId = Faker.random.uuid();
        const secondName = Faker.name.firstName();

        this.setDatabaseDocument(User.collection, firstId, { name: firstName });
        this.setDatabaseDocument(User.collection, secondId, { name: secondName });

        // Act
        const documents = await this.engine.readMany(User.collection);

        // Assert
        expect(Object.values(documents)).toHaveLength(2);
        expect(documents[firstId]).toEqual({ name: firstName });
        expect(documents[secondId]).toEqual({ name: secondName });
    }

    public async testReadManyFilters(): Promise<void> {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.setDatabaseDocument(User.collection, id, { name });
        this.setDatabaseDocument(User.collection, Faker.random.uuid(), { name: Faker.name.firstName() });

        // Act
        const documents = await this.engine.readMany(User.collection, { name });

        // Assert
        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    }

    public async testUpdate(): Promise<void> {
        // Arrange
        const id = Faker.random.uuid();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const age = Faker.random.number();

        this.setDatabaseDocument(User.collection, id, { name: initialName, surname: Faker.name.lastName(), age });

        // Act
        await this.engine.update(User.collection, id, { name: newName, surname: { $unset: true } });

        // Assert
        const user = await this.getDatabaseDocument(User.collection, id);

        expect(user).toEqual({ name: newName, age });
    }

    public async testUpdateNonExistent(): Promise<void> {
        await expect(this.engine.update(User.collection, Faker.random.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    }

    public async testDelete(): Promise<void> {
        // Arrange
        const firstId = Faker.random.uuid();
        const secondId = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.setDatabaseDocument(User.collection, firstId, { name: Faker.name.firstName() });
        this.setDatabaseDocument(User.collection, secondId, { name });

        // Act
        await this.engine.delete(User.collection, firstId);

        // Assert
        const users = await this.getDatabaseDocuments(User.collection);

        expect(users).toHaveLength(1);
        expect(users[0]).toEqual({ name });
    }

    public async testDeleteNonExistent(): Promise<void> {
        await expect(this.engine.delete(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

    public async testDeleteNonExistentCollection(): Promise<void> {
        await expect(this.engine.delete(Faker.random.word(), Faker.random.uuid()))
            .rejects.toThrow(DocumentNotFound);
    }

    private async resetDatabase(): Promise<void> {
        await this.initMetaDatabase();
        await this.initCollectionsDatabase();
    }

    private async initMetaDatabase(): Promise<void> {
        if (this.metadataConnection) {
            return;
        }

        this.metadataConnection = await openDB(`${this.databaseName}-meta`, 1, {
            upgrade: database => database.createObjectStore('collections', { keyPath: 'name' }),
        });

        const transaction = this.metadataConnection.transaction('collections', 'readwrite');

        for (const collection of this.databaseCollections) {
            transaction.store.add({ name: collection });
        }

        await transaction.done;
    }

    private async initCollectionsDatabase(): Promise<void> {
        if (this.collectionsConnection) {
            return;
        }

        this.collectionsConnection = await openDB(this.databaseName, this.databaseCollections.length, {
            upgrade: database => {
                for (const collection of this.databaseCollections) {
                    database.createObjectStore(collection);
                }
            },
        });
    }

    private closeConnections(): void {
        if (this.metadataConnection) {
            this.metadataConnection.close();
        }

        if (this.collectionsConnection) {
            this.collectionsConnection.close();
        }

        delete this.metadataConnection;
        delete this.collectionsConnection;
    }

    private async dropDatabases(): Promise<void> {
        await deleteDB(`${this.databaseName}-meta`);
        await deleteDB(this.databaseName);
    }

    private async getDatabaseDocument(collection: string, id: string): Promise<any> {
        const transaction = await this.getCollectionTransaction(collection, 'readonly');

        return transaction.store.get(id);
    }

    private async getDatabaseDocuments(collection: string): Promise<any> {
        const transaction = await this.getCollectionTransaction(collection, 'readonly');

        return transaction.store.getAll();
    }

    private async setDatabaseDocument(collection: string, id: string, document: any): Promise<void> {
        const transaction = await this.getCollectionTransaction(collection, 'readwrite');

        transaction.store.put(document, id);

        await transaction.done;
    }

    private async getCollectionTransaction(
        collection: string,
        mode: IDBTransactionMode,
    ): Promise<IDBPTransaction<unknown, [string]>> {
        return this.collectionsConnection.transaction(collection, mode);
    }

}
