import { deleteDB, openDB } from 'idb';
import { Semaphore, memo } from '@noeldemartin/utils';
import type { DBSchema, IDBPCursorWithValue, IDBPDatabase, IDBPTransaction } from 'idb';

import DocumentAlreadyExists from 'soukai/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai/errors/DocumentNotFound';
import SoukaiError from 'soukai/errors/SoukaiError';

import type {
    Engine,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from 'soukai/engines/Engine';

import { EngineHelper } from 'soukai/engines/EngineHelper';
import type { ClosesConnections } from 'soukai/engines/ClosesConnections';

interface MetadataSchema extends DBSchema {
    collections: {
        key: string;
        value: { name: string; dropped?: true };
    };
}

interface DocumentsSchema extends DBSchema {
    __collection_name__: {
        key: string;
        value: EngineDocument;
    };
}

export class IndexedDBEngine implements Engine, ClosesConnections {

    private database: string;
    private helper: EngineHelper;
    private lock: Semaphore;
    private _metadataConnection?: IDBPDatabase<MetadataSchema>;
    private _documentsConnection?: IDBPDatabase<DocumentsSchema>;

    public constructor(database: null | string = null) {
        this.database = database ? 'soukai-' + database : 'soukai';
        this.helper = new EngineHelper();
        this.lock = memo(`idb-${this.database}`, () => new Semaphore());
    }

    public async getCollections(): Promise<string[]> {
        const keys = await this.withMetadataTransaction('readonly', (transaction) => transaction.store.getAllKeys());

        return keys.map((key) => key.toString());
    }

    public async deleteCollections(collections: string[]): Promise<void> {
        const allCollections = await this.getCollections();

        await this.withMetadataTransaction('readwrite', (transaction) => {
            collections.forEach((collection) => transaction.store.put({ name: collection, dropped: true }, collection));

            return transaction.done;
        });

        await this.withDocumentsTransaction(allCollections, collections, 'readwrite', (transaction) => {
            collections.forEach((collection) => transaction.db.deleteObjectStore(collection as '__collection_name__'));

            return transaction.done;
        });
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

    public create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        return this.lock.run(async () => {
            const documentId = this.helper.obtainDocumentId(id);

            if (await this.documentExists(collection, documentId)) {
                throw new DocumentAlreadyExists(documentId);
            }

            await this.createDocument(collection, documentId, document);

            return documentId;
        });
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        if (!(await this.collectionExists(collection))) {
            throw new DocumentNotFound(id, collection);
        }

        const document = await this.getDocument(collection, id);
        if (!document) {
            throw new DocumentNotFound(id, collection);
        }

        return document;
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        const documents = {} as EngineDocumentsCollection;
        const collections = await this.getCollections();

        if (collections.indexOf(collection) === -1) {
            return documents;
        }

        await this.withDocumentsTransaction(collections, collection, 'readonly', (transaction) => {
            const processCursor = async (cursor: IDBPCursorWithValue<DocumentsSchema> | null): Promise<void> => {
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
        await this.lock.run(async () => {
            const document = await this.getDocument(collection, id);

            if (!document) {
                throw new DocumentNotFound(id, collection);
            }

            this.helper.updateAttributes(document, updates);

            await this.updateDocument(collection, id, document);
        });
    }

    public async delete(collection: string, id: string): Promise<void> {
        await this.lock.run(async () => {
            if (!(await this.documentExists(collection, id))) {
                throw new DocumentNotFound(id, collection);
            }

            await this.deleteDocument(collection, id);
        });
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

            const document = await this.withDocumentsTransaction(collections, collection, 'readonly', (transaction) =>
                transaction.store.get(id));

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

        return this.withDocumentsTransaction(collections, collection, 'readwrite', (transaction) => {
            transaction.store.add(document, id);

            return transaction.done;
        });
    }

    private async updateDocument(collection: string, id: string, document: EngineDocument): Promise<void> {
        const collections = await this.getCollections();

        return this.withDocumentsTransaction(collections, collection, 'readwrite', (transaction) => {
            transaction.store.put(document, id);

            return transaction.done;
        });
    }

    private async deleteDocument(collection: string, id: string): Promise<void> {
        const collections = await this.getCollections();

        return this.withDocumentsTransaction(collections, collection, 'readwrite', (transaction) => {
            transaction.store.delete(id);

            return transaction.done;
        });
    }

    private async withMetadataTransaction<TResult, TMode extends IDBTransactionMode>(
        mode: TMode,
        operation: (transaction: IDBPTransaction<MetadataSchema, ['collections'], TMode>) => TResult,
    ): Promise<TResult> {
        const connection = (this._metadataConnection =
            this._metadataConnection ||
            ((await openDB(`${this.database}-meta`, 1, {
                upgrade(db) {
                    if (db.objectStoreNames.contains('collections')) {
                        return;
                    }

                    db.createObjectStore('collections', { keyPath: 'name' });
                },
                blocked: () => this.throwDatabaseBlockedError(),
            })) as unknown as IDBPDatabase<MetadataSchema>));

        return this.retryingOnTransactionInactive(() => {
            const transaction = connection.transaction('collections', mode);

            return operation(transaction);
        });
    }

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        collections: string[],
        collection: string | string[],
        mode: TMode,
        operation: (transaction: IDBPTransaction<DocumentsSchema, ['__collection_name__'], TMode>) => TResult,
    ): Promise<TResult> {
        const connection = (this._documentsConnection =
            this._documentsConnection ||
            ((await openDB(this.database, collections.length, {
                upgrade(db) {
                    for (const documentsCollection of collections) {
                        if (db.objectStoreNames.contains(documentsCollection)) {
                            continue;
                        }

                        db.createObjectStore(documentsCollection);
                    }
                },
                blocked: () => this.throwDatabaseBlockedError(),
            })) as unknown as IDBPDatabase<DocumentsSchema>));

        return this.retryingOnTransactionInactive(() => {
            const transaction = connection.transaction(collection as '__collection_name__', mode);

            return operation(transaction);
        });
    }

    // See https://github.com/jakearchibald/idb/issues/201
    private retryingOnTransactionInactive<R>(operation: () => R): R {
        try {
            return operation();
        } catch (error) {
            if (
                !(error instanceof Error) ||
                (!error.name.toLowerCase().includes('inactive') && !error.message.toLowerCase().includes('inactive'))
            ) {
                throw error;
            }

            return operation();
        }
    }

    private async createCollection(collection: string): Promise<void> {
        await this.withMetadataTransaction('readwrite', (transaction) => {
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
