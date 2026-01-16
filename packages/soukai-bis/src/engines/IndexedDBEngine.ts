import { openDB } from 'idb';
import { jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { Semaphore, reduceBy, requireUrlParentDirectory } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import type Operation from 'soukai-bis/models/crdts/Operation';

import type Engine from './Engine';

export interface LocalDocument {
    url: string;
    graph: JsonLD;
}

interface DocumentsSchema extends DBSchema {
    '[containerUrl]': {
        key: string;
        value: LocalDocument;
    };
}

interface MetadataSchema extends DBSchema {
    collections: {
        key: string;
        value: {
            name: string;
        };
    };
}

export default class IndexedDBEngine implements Engine {

    private database: string;
    private metadataConnection: Promise<IDBPDatabase<MetadataSchema>> | null = null;
    private documentsConnection: Promise<IDBPDatabase<DocumentsSchema>> | null = null;
    private lock: Semaphore;

    public constructor(database: string = 'soukai-bis') {
        this.database = database;
        this.lock = new Semaphore();
    }

    public async createDocument(url: string, graph: JsonLD): Promise<void> {
        await this.lock.run(async () => {
            const containerUrl = requireUrlParentDirectory(url);

            await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                if (await transaction.store.get(url)) {
                    throw new DocumentAlreadyExists(url);
                }

                return transaction.store.add({ url, graph });
            });
        });
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        await this.lock.run(async () => {
            const containerUrl = requireUrlParentDirectory(url);

            if (!(await this.collectionExists(containerUrl))) {
                throw new DocumentNotFound(url);
            }

            await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                const document = await transaction.store.get(url);

                if (!document) {
                    throw new DocumentNotFound(url);
                }

                let quads = await jsonldToQuads(document.graph);

                for (const operation of operations) {
                    quads = operation.applyToQuads(quads);
                }

                return transaction.store.put({ url, graph: await quadsToJsonLD(quads) });
            });
        });
    }

    public async readOneDocument(url: string): Promise<JsonLD> {
        return this.lock.run(async () => {
            const containerUrl = requireUrlParentDirectory(url);

            if (!(await this.collectionExists(containerUrl))) {
                throw new DocumentNotFound(url);
            }

            const document = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
                return transaction.store.get(url);
            });

            if (!document) {
                throw new DocumentNotFound(url);
            }

            return document.graph;
        });
    }

    public async readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>> {
        return this.lock.run(async () => {
            if (!(await this.collectionExists(containerUrl))) {
                return {};
            }

            const documents = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
                return transaction.store.getAll();
            });

            return reduceBy(documents, 'url', (document) => document.graph);
        });
    }

    public async close(): Promise<void> {
        if (this.metadataConnection) {
            (await this.metadataConnection).close();
            this.metadataConnection = null;
        }

        if (this.documentsConnection) {
            (await this.documentsConnection).close();
            this.documentsConnection = null;
        }
    }

    private async createCollection(collection: string): Promise<void> {
        if (await this.collectionExists(collection)) {
            return;
        }

        await this.withMetadataTransaction('readwrite', (transaction) => {
            return transaction.store.add({ name: collection });
        });
    }

    private async collectionExists(collection: string): Promise<boolean> {
        const collections = await this.getCollections();

        return collections.includes(collection);
    }

    private async getCollections(): Promise<string[]> {
        const documents = await this.withMetadataTransaction('readonly', (transaction) => {
            return transaction.store.getAll();
        });

        return documents.map((document) => document.name);
    }

    private async withMetadataTransaction<TResult, TMode extends IDBTransactionMode>(
        mode: TMode,
        operation: (transaction: IDBPTransaction<MetadataSchema, ['collections'], TMode>) => Promise<TResult>,
    ): Promise<TResult> {
        const connection = await this.getMetadataConnection();
        const transaction = connection.transaction('collections', mode);

        return operation(transaction);
    }

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        collection: string,
        mode: TMode,
        operation: (transaction: IDBPTransaction<DocumentsSchema, ['[containerUrl]'], TMode>) => Promise<TResult>,
    ): Promise<TResult> {
        if (mode === 'readwrite' && !(await this.collectionExists(collection))) {
            await this.createCollection(collection);
        }

        const connection = await this.getDocumentsConnection();
        const transaction = connection.transaction(collection as '[containerUrl]', mode);

        return operation(transaction);
    }

    private async getMetadataConnection(): Promise<IDBPDatabase<MetadataSchema>> {
        if (this.metadataConnection) {
            return this.metadataConnection;
        }

        return (this.metadataConnection = openDB<MetadataSchema>(`${this.database}-meta`, 1, {
            upgrade(db) {
                if (db.objectStoreNames.contains('collections')) {
                    return;
                }

                db.createObjectStore('collections', { keyPath: 'name' });
            },
        }));
    }

    private async getDocumentsConnection(): Promise<IDBPDatabase<DocumentsSchema>> {
        if (this.documentsConnection) {
            return this.documentsConnection;
        }

        const collections = await this.getCollections();

        return (this.documentsConnection = openDB<DocumentsSchema>(this.database, collections.length + 1, {
            upgrade(database) {
                for (const collection of collections) {
                    if (database.objectStoreNames.contains(collection as '[containerUrl]')) {
                        continue;
                    }

                    database.createObjectStore(collection as '[containerUrl]', { keyPath: 'url' });
                }
            },
        }));
    }

}
