import { deleteDB, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';
import SoukaiError from '@/errors/SoukaiError';

import Engine, { Documents, EngineAttributes, Filters } from '@/engines/Engine';
import EngineHelper from '@/engines/EngineHelper';

export default class IndexedDBEngine implements Engine {

    private database: string;
    private metadataConnection: IDBPDatabase<unknown>;
    private documentsConnection: IDBPDatabase<unknown>;
    private helper: EngineHelper;

    public constructor(database: string = 'soukai') {
        this.database = database;
        this.helper = new EngineHelper();
    }

    public async purgeDatabase(): Promise<void> {
        await deleteDB(`${this.database}-meta`, { blocked: () => this.throwDatabaseBlockedError() });
        await deleteDB(this.database, { blocked: () => this.throwDatabaseBlockedError() });
    }

    public closeConnections(): void {
        if (this.metadataConnection) {
            this.metadataConnection.close();
        }

        if (this.documentsConnection) {
            this.documentsConnection.close();
        }

        delete this.metadataConnection;
        delete this.documentsConnection;
    }

    public async create(collection: string, attributes: EngineAttributes, id?: string): Promise<string> {
        id = this.helper.obtainDocumentId(id);

        const transaction = await this.getCollectionTransaction(collection, 'readwrite');
        const document = await transaction.store.get(id);

        if (document) {
            throw new DocumentAlreadyExists(id);
        }

        transaction.store.add(attributes, id);

        await transaction.done;

        return id;
    }

    public async readOne(collection: string, id: string): Promise<EngineAttributes> {
        const transaction = await this.getCollectionTransaction(collection, 'readonly');
        const document = await transaction.store.get(id);

        if (!document) {
            throw new DocumentNotFound(id);
        }

        return document;
    }

    public async readMany(collection: string, filters?: Filters): Promise<Documents> {
        const transaction = await this.getCollectionTransaction(collection, 'readonly');

        const documents = {};
        for (
            let documentsCursor = await transaction.store.openCursor();
            documentsCursor !== null;
            documentsCursor = await documentsCursor!.continue()
        ) {
            documents[documentsCursor.key as string] = documentsCursor.value;
        }

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(
        collection: string,
        id: string,
        updatedAttributes: EngineAttributes,
        removedAttributes: string[],
    ): Promise<void> {
        const transaction = await this.getCollectionTransaction(collection, 'readwrite');
        const document = await transaction.store.get(id);

        if (!document) {
            throw new DocumentNotFound(id);
        }

        for (const attribute in updatedAttributes) {
            document[attribute] = updatedAttributes[attribute];
        }

        for (const attribute of removedAttributes) {
            delete document[attribute];
        }

        transaction.store.put(document, id);

        await transaction.done;
    }

    public async delete(collection: string, id: string): Promise<void> {
        const transaction = await this.getCollectionTransaction(collection, 'readwrite');
        const document = await transaction.store.get(id);

        if (!document) {
            throw new DocumentNotFound(id);
        }

        transaction.store.delete(id);

        await transaction.done;
    }

    private async getCollectionTransaction(
        collection: string,
        mode: IDBTransactionMode,
    ): Promise<IDBPTransaction<unknown, [string]>> {
        const meta = await this.getDatabaseMetadata();

        if (meta.collections.indexOf(collection) === -1) {
            await meta.addCollection(collection);

            if (this.documentsConnection) {
                this.documentsConnection.close();

                delete this.documentsConnection;
            }
        }

        this.documentsConnection = this.documentsConnection
            || await openDB(this.database, meta.collections.length, {
                upgrade(db) {
                    for (const documentsCollection of meta.collections) {
                        if (db.objectStoreNames.contains(documentsCollection)) {
                            continue;
                        }

                        db.createObjectStore(documentsCollection);
                    }
                },
                blocked: () => this.throwDatabaseBlockedError(),
            });

        return this.documentsConnection.transaction(collection, mode);
    }

    private async getDatabaseMetadata() {
        this.metadataConnection = this.metadataConnection
            || await openDB(`${this.database}-meta`, 1, {
                upgrade(db) {
                    if (db.objectStoreNames.contains('collections')) {
                        return;
                    }

                    db.createObjectStore('collections', { keyPath: 'name' });
                },
                blocked: () => this.throwDatabaseBlockedError(),
            });

        const transaction = this.metadataConnection.transaction('collections', 'readwrite');

        return {
            collections: await transaction.store.getAllKeys() as string[],

            async addCollection(collection: string) {
                this.collections.push(collection);

                transaction.store.add({ name: collection });
                await transaction.done;
            },
        };
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError(
            'An attempt to open an IndexedDB connection has been blocked, ' +
            'remember to call IndexedDBEngine.closeConnections when necessary. ' +
            'Learn more at https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event',
        );
    }

}
