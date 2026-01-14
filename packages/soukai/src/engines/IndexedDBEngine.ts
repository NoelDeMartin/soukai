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

interface CollectionMetadata {
    name: string;
    updates?: number;
    dropped?: true;
}

interface MetadataSchema extends DBSchema {
    collections: {
        key: string;
        value: CollectionMetadata;
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
    private _metadata?: Record<string, CollectionMetadata>;
    private _metadataConnection?: IDBPDatabase<MetadataSchema>;
    private _documentsConnection?: IDBPDatabase<DocumentsSchema>;

    public constructor(database: null | string = null) {
        this.database = database ? 'soukai-' + database : 'soukai';
        this.helper = new EngineHelper();
        this.lock = memo(`idb-${this.database}`, () => new Semaphore());
    }

    public getCollections(): Promise<string[]> {
        return this.lock.run(() => this.__getCollections());
    }

    public async dropCollections(collections: string[]): Promise<void> {
        await this.lock.run(async () => {
            await this.withMetadataTransaction('readwrite', (transaction) => {
                collections.forEach((collection) => {
                    transaction.store.put({
                        name: collection,
                        dropped: true,
                        updates: (this._metadata?.[collection]?.updates ?? 1) + 1,
                    });
                });

                return transaction.done;
            });

            this.closeConnections();

            await this.getDocumentsConnection();
        });
    }

    public async purgeDatabase(): Promise<void> {
        await this.lock.run(async () => {
            this.closeConnections();

            await Promise.all([
                deleteDB(`${this.database}-meta`, { blocked: () => this.throwDatabaseBlockedError() }),
                deleteDB(this.database, { blocked: () => this.throwDatabaseBlockedError() }),
            ]);

            delete this._metadata;
        });
    }

    public async closeConnections(): Promise<void> {
        if (this._metadataConnection) {
            this._metadataConnection.close();
        }

        if (this._documentsConnection) {
            this._documentsConnection.close();
        }

        delete this._metadata;
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
        return this.lock.run(async () => {
            if (!(await this.collectionExists(collection))) {
                throw new DocumentNotFound(id, collection);
            }

            const document = await this.getDocument(collection, id);
            if (!document) {
                throw new DocumentNotFound(id, collection);
            }

            return document;
        });
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        return this.lock.run(async () => {
            const documents = {} as EngineDocumentsCollection;
            const collections = await this.__getCollections();

            if (collections.indexOf(collection) === -1) {
                return documents;
            }

            await this.withDocumentsTransaction(collection, 'readonly', (transaction) => {
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
        });
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

    private async __getCollections(): Promise<string[]> {
        const metadata = await this.getMetadata();

        return Object.values(metadata)
            .filter(({ dropped }) => !dropped)
            .map(({ name }) => name.toString());
    }

    private async collectionExists(collection: string): Promise<boolean> {
        const collections = await this.__getCollections();

        return collections.indexOf(collection) !== -1;
    }

    private async documentExists(collection: string, id: string): Promise<boolean> {
        const document = await this.getDocument(collection, id);

        return !!document;
    }

    private async getDocument(collection: string, id: string): Promise<EngineDocument | null> {
        try {
            const collections = await this.__getCollections();

            if (collections.indexOf(collection) === -1) {
                return null;
            }

            const document = await this.withDocumentsTransaction(collection, 'readonly', (transaction) =>
                transaction.store.get(id));

            return document || null;
        } catch (error) {
            return null;
        }
    }

    private async createDocument(collection: string, id: string, document: EngineDocument): Promise<void> {
        const collections = await this.__getCollections();

        if (collections.indexOf(collection) === -1) {
            await this.createCollection(collection);

            collections.push(collection);
        }

        return this.withDocumentsTransaction(collection, 'readwrite', (transaction) => {
            transaction.store.add(document, id);

            return transaction.done;
        });
    }

    private async updateDocument(collection: string, id: string, document: EngineDocument): Promise<void> {
        const collections = await this.__getCollections();

        if (collections.indexOf(collection) === -1) {
            return;
        }

        return this.withDocumentsTransaction(collection, 'readwrite', (transaction) => {
            transaction.store.put(document, id);

            return transaction.done;
        });
    }

    private async deleteDocument(collection: string, id: string): Promise<void> {
        const collections = await this.__getCollections();

        if (collections.indexOf(collection) === -1) {
            return;
        }

        return this.withDocumentsTransaction(collection, 'readwrite', (transaction) => {
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
        collectionOrCollections: string | string[],
        mode: TMode,
        operation: (transaction: IDBPTransaction<DocumentsSchema, ['__collection_name__'], TMode>) => TResult,
    ): Promise<TResult> {
        const connection = await this.getDocumentsConnection();

        return this.retryingOnTransactionInactive(() => {
            const transaction = connection.transaction(collectionOrCollections as '__collection_name__', mode);

            return operation(transaction);
        });
    }

    private async getDocumentsConnection(): Promise<IDBPDatabase<DocumentsSchema>> {
        const metadata = await this.getMetadata();
        const version = Object.values(metadata).reduce((total, { updates }) => total + (updates ?? 1), 0);

        return (this._documentsConnection =
            this._documentsConnection ||
            ((await openDB(this.database, version, {
                upgrade(db) {
                    for (const { name, dropped } of Object.values(metadata)) {
                        if (
                            (db.objectStoreNames.contains(name) && !dropped) ||
                            (!db.objectStoreNames.contains(name) && dropped)
                        ) {
                            continue;
                        }

                        dropped ? db.deleteObjectStore(name) : db.createObjectStore(name);
                    }
                },
                blocked: () => this.throwDatabaseBlockedError(),
            })) as unknown as IDBPDatabase<DocumentsSchema>));
    }

    private async getMetadata(): Promise<Record<string, CollectionMetadata>> {
        return (this._metadata ??= await this.initializeMetadata());
    }

    private async initializeMetadata(): Promise<Record<string, CollectionMetadata>> {
        const documents = await this.withMetadataTransaction('readonly', (transaction) => transaction.store.getAll());

        return documents.reduce(
            (metadata, document) => {
                metadata[document.name] = document;

                return metadata;
            },
            {} as Record<string, CollectionMetadata>,
        );
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

        delete this._metadata;

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
