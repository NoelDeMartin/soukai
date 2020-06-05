import { DBSchema, deleteDB, IDBPObjectStore, openDB, TypedDOMStringList } from 'idb';

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
    readonly objectStoreNames: TypedDOMStringList<any>;
    transaction(
        storeNames: string | string[],
        mode?: IDBTransactionMode,
    ): DatabaseTransaction<Schema>;
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
    private metadataConnection: DatabaseConnection<MetadataSchema>;
    private documentsConnection: DatabaseConnection<DocumentsSchema>;
    private helper: EngineHelper;

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
        if (this.metadataConnection) {
            this.metadataConnection.close();
        }

        if (this.documentsConnection) {
            this.documentsConnection.close();
        }

        delete this.metadataConnection;
        delete this.documentsConnection;
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        id = this.helper.obtainDocumentId(id);

        const transaction = (await this.startDocumentsTransaction('readwrite', collection, true))!;
        const existingDocument = await transaction.store.get(id);

        if (existingDocument) {
            throw new DocumentAlreadyExists(id);
        }

        transaction.store.add(document, id);

        await transaction.done;

        return id;
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        const transaction = await this.startDocumentsTransaction('readonly', collection);
        if (!transaction) {
            throw new DocumentNotFound(id);
        }

        const document = await transaction.store.get(id);
        if (!document) {
            throw new DocumentNotFound(id);
        }

        return document;
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        const transaction = await this.startDocumentsTransaction('readonly', collection);
        const documents = {};

        if (!transaction) {
            return documents;
        }

        for (
            let documentsCursor = await transaction.store.openCursor();
            documentsCursor !== null;
            documentsCursor = await documentsCursor!.continue()
        ) {
            documents[documentsCursor.key as string] = documentsCursor.value;
        }

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        const transaction = (await this.startDocumentsTransaction('readwrite', collection, true))!;
        const document = await transaction.store.get(id);

        if (!document) {
            throw new DocumentNotFound(id);
        }

        this.helper.updateAttributes(document, updates);

        transaction.store.put(document, id);

        await transaction.done;
    }

    public async delete(collection: string, id: string): Promise<void> {
        const transaction = await this.startDocumentsTransaction('readwrite', collection);
        if (!transaction) {
            throw new DocumentNotFound(id);
        }

        const document = await transaction.store.get(id);
        if (!document) {
            throw new DocumentNotFound(id);
        }

        transaction.store.delete(id);

        await transaction.done;
    }

    private async startDocumentsTransaction(
        mode: IDBTransactionMode,
        collection: string,
        createCollection: boolean = false,
    ): Promise<DatabaseTransaction<DocumentsSchema> | null> {
        const metadataTransaction = await this.startMetadataTransaction('readwrite');
        const collections = await metadataTransaction.store.getAllKeys();

        if (collections.indexOf(collection) === -1) {
            if (!createCollection) {
                return null;
            }

            collections.push(collection);
            metadataTransaction.store.add({ name: collection });

            await metadataTransaction.done;

            if (this.documentsConnection) {
                this.documentsConnection.close();

                delete this.documentsConnection;
            }
        }

        this.documentsConnection = this.documentsConnection
            || await openDB<any>(this.database, collections.length, {
                upgrade(db) {
                    for (const documentsCollection of collections) {
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

    private async startMetadataTransaction(mode: IDBTransactionMode): Promise<DatabaseTransaction<MetadataSchema>> {
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

        return this.metadataConnection.transaction('collections', mode);
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError(
            'An attempt to open an IndexedDB connection has been blocked, ' +
            'remember to call IndexedDBEngine.closeConnections when necessary. ' +
            'Learn more at https://developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest/blocked_event',
        );
    }

}
