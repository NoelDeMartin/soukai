import { DBSchema, deleteDB, IDBPCursorWithValue, IDBPObjectStore, openDB, TypedDOMStringList } from 'idb';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';
import SoukaiError from '@/errors/SoukaiError';

import Engine, {
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from '@/engines/Engine';

import ClosesConnections from '@/engines/ClosesConnections';
import EngineHelper from '@/engines/EngineHelper';

interface DatabaseConnection<Schema extends DBSchema> {
    readonly objectStoreNames: TypedDOMStringList<string>;
    transaction(storeNames: string | string[], mode?: IDBTransactionMode): DatabaseTransaction<Schema>;
    close(): void;
}

interface DatabaseTransaction<Schema> {
    readonly done: Promise<void>;
    readonly store: IDBPObjectStore<Schema>;
}

interface MetadataSchema extends DBSchema {
    collections: {
        key: string;
        value: { name: string };
    };
}

interface DocumentsSchema extends DBSchema {
    [collection: string]: {
        key: string;
        value: EngineDocument;
    };
}

export default class IndexedDBEngine implements Engine, ClosesConnections {

    private database: string;
    private helper: EngineHelper;
    private _metadataConnection?: DatabaseConnection<MetadataSchema>;
    private _documentsConnection?: DatabaseConnection<DocumentsSchema>;

    public constructor(database: null | string = null) {
        this.database = database ? 'soukai-' + database : 'soukai';
        this.helper = new EngineHelper();
    }

    public async purgeDatabase(): Promise<void> {
        this.closeConnections();

        await Promise.all([
            deleteDB(`${this.database}-meta`, { blocked: () => this.throwDatabaseBlockedError() }),
            deleteDB(this.database, { blocked: () => this.throwDatabaseBlockedError() }),
        ]);
    }

    public async closeConnections(): Promise<void> {
        if (this._metadataConnection) {
            this._metadataConnection.close();
        }

        if (this._documentsConnection) {
            this._documentsConnection.close();
        }

        delete this._metadataConnection;
        delete this._documentsConnection;
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        id = this.helper.obtainDocumentId(id);

        if (await this.documentExists(collection, id)) {
            throw new DocumentAlreadyExists(id);
        }

        await this.createDocument(collection, id, document);

        return id;
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        if (!(await this.collectionExists(collection))) {
            throw new DocumentNotFound(id);
        }

        const document = await this.getDocument(collection, id);
        if (!document) {
            throw new DocumentNotFound(id);
        }

        return document;
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        const documents = {};
        const collections = await this.getCollections();

        if (collections.indexOf(collection) === -1) {
            return documents;
        }

        await this.withDocumentsTransaction(collections, collection, 'readonly', transaction => {
            const processCursor = (cursor: IDBPCursorWithValue<DocumentsSchema> | null) => {
                if (!cursor) {
                    return;
                }

                documents[cursor.key] = cursor.value;

                return cursor.continue().then(processCursor);
            };

            return transaction.store.openCursor().then(processCursor);
        });

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        const document = await this.getDocument(collection, id);

        if (!document) {
            throw new DocumentNotFound(id);
        }

        this.helper.updateAttributes(document, updates);

        await this.updateDocument(collection, id, document);
    }

    public async delete(collection: string, id: string): Promise<void> {
        if (!(await this.documentExists(collection, id))) {
            throw new DocumentNotFound(id);
        }

        await this.deleteDocument(collection, id);
    }

    private async collectionExists(collection: string): Promise<boolean> {
        const collections = await this.getCollections();

        return collections.indexOf(collection) !== -1;
    }

    private async documentExists(collection: string, id: string): Promise<boolean> {
        const document = await this.getDocument(collection, id);

        return !!document;
    }

    private async getDocument(collection: string, id: string): Promise<EngineDocument | null> {
        try {
            const collections = await this.getCollections();

            if (collections.indexOf(collection) === -1) {
                return null;
            }

            const document = await this.withDocumentsTransaction(
                collections,
                collection,
                'readonly',
                transaction => transaction.store.get(id),
            );

            return document || null;
        } catch (error) {
            return null;
        }
    }

    private async createDocument(collection: string, id: string, document: EngineDocument): Promise<void> {
        const collections = await this.getCollections();

        if (collections.indexOf(collection) === -1) {
            await this.createCollection(collection);

            collections.push(collection);
        }

        return this.withDocumentsTransaction(collections, collection, 'readwrite', transaction => {
            transaction.store.add(document, id);

            return transaction.done;
        });
    }

    private async updateDocument(collection: string, id: string, document: EngineDocument): Promise<void> {
        const collections = await this.getCollections();

        return this.withDocumentsTransaction(collections, collection, 'readwrite', transaction => {
            transaction.store.put(document, id);

            return transaction.done;
        });
    }

    private async deleteDocument(collection: string, id: string): Promise<void> {
        const collections = await this.getCollections();

        return this.withDocumentsTransaction(collections, collection, 'readwrite', transaction => {
            transaction.store.delete(id);

            return transaction.done;
        });
    }

    private async withMetadataTransaction<R>(
        mode: IDBTransactionMode,
        operation: (transaction: DatabaseTransaction<MetadataSchema>) => R,
    ): Promise<R> {
        const connection = this._metadataConnection = this._metadataConnection
            || await openDB(`${this.database}-meta`, 1, {
                upgrade(db) {
                    if (db.objectStoreNames.contains('collections')) {
                        return;
                    }

                    db.createObjectStore('collections', { keyPath: 'name' });
                },
                blocked: () => this.throwDatabaseBlockedError(),
            }) as unknown as DatabaseConnection<MetadataSchema>;

        return this.retryingOnTransactionInactive(() => {
            const transaction = connection.transaction('collections', mode);

            return operation(transaction);
        });
    }

    private async withDocumentsTransaction<R>(
        collections: string[],
        collection: string,
        mode: IDBTransactionMode,
        operation: (transaction: DatabaseTransaction<DocumentsSchema>) => R,
    ): Promise<R> {
        const connection = this._documentsConnection = this._documentsConnection
            || await openDB(this.database, collections.length, {
                upgrade(db) {
                    for (const documentsCollection of collections) {
                        if (db.objectStoreNames.contains(documentsCollection)) {
                            continue;
                        }

                        db.createObjectStore(documentsCollection);
                    }
                },
                blocked: () => this.throwDatabaseBlockedError(),
            }) as unknown as DatabaseConnection<DocumentsSchema>;

        return this.retryingOnTransactionInactive(() => {
            const transaction = connection.transaction(collection, mode);

            return operation(transaction);
        });
    }

    // See https://github.com/jakearchibald/idb/issues/201
    private retryingOnTransactionInactive<R>(operation: () => R): R {
        try {
            return operation();
        } catch (error) {
            if (
                !(error instanceof Error) || (
                    !error.name.toLowerCase().includes('inactive') &&
                    !error.message.toLowerCase().includes('inactive')
                )
            ) {
                throw error;
            }

            return operation();
        }
    }

    private async getCollections(): Promise<string[]> {
        return this.withMetadataTransaction(
            'readonly',
            transaction => transaction.store.getAllKeys(),
        );
    }

    private async createCollection(collection: string): Promise<void> {
        await this.withMetadataTransaction('readwrite', transaction => {
            transaction.store.add({ name: collection });

            return transaction.done;
        });

        if (this._documentsConnection) {
            this._documentsConnection.close();

            delete this._documentsConnection;
        }
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError(
            'An attempt to open an IndexedDB connection has been blocked, ' +
            'remember to call IndexedDBEngine.closeConnections when necessary. ' +
            'Learn more at https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event',
        );
    }

}
