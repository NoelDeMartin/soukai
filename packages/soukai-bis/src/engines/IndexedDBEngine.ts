import { openDB } from 'idb';
import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { Semaphore } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/utils/urls';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';
import type Operation from 'soukai-bis/models/crdts/Operation';

import Engine from './Engine';

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
    containers: {
        key: string;
        value: {
            url: string;
        };
    };
}

export default class IndexedDBEngine extends Engine {

    private database: string;
    private metadataConnection: Promise<IDBPDatabase<MetadataSchema>> | null = null;
    private documentsConnection: Promise<IDBPDatabase<DocumentsSchema>> | null = null;
    private lock: Semaphore;

    public constructor(database: string = 'soukai-bis') {
        super();

        this.database = database;
        this.lock = new Semaphore();
    }

    public async createDocument(url: string, contents: JsonLD | Quad[]): Promise<void> {
        await this.lock.run(async () => {
            const containerUrl = requireSafeContainerUrl(url);

            await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                if (await transaction.store.get(url)) {
                    throw new DocumentAlreadyExists(url);
                }

                const graph = Array.isArray(contents) ? await quadsToJsonLD(contents) : contents;

                if (url.endsWith('/')) {
                    this.removeContainerProperties(graph, { keepTypes: true });
                }

                return transaction.store.add({ url, graph });
            });
        });
    }

    public async readDocument(url: string): Promise<SolidDocument> {
        return this.lock.run(async () => {
            if (url.endsWith('/')) {
                return this.readContainerDocument(url);
            }

            const containerUrl = requireSafeContainerUrl(url);
            const containerExists = await this.containerExists(containerUrl);

            if (!containerExists) {
                throw new DocumentNotFound(url);
            }

            const document = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
                return transaction.store.get(url);
            });

            if (!document) {
                throw new DocumentNotFound(url);
            }

            return new SolidDocument(url, await jsonldToQuads(document.graph));
        });
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        operations = url.endsWith('/') ? this.filterContainerOperations(operations) : operations;

        if (operations.length === 0) {
            return;
        }

        await this.lock.run(async () => {
            const containerUrl = requireSafeContainerUrl(url);

            if (!(await this.containerExists(containerUrl))) {
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

    public async deleteDocument(url: string): Promise<void> {
        await this.lock.run(async () => {
            const containerUrl = requireSafeContainerUrl(url);

            if (!(await this.containerExists(containerUrl))) {
                return;
            }

            await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                return transaction.store.delete(url);
            });
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

    private async readContainerDocument(url: string): Promise<SolidDocument> {
        const containerUrls = await this.getContainerUrls();
        const exists = containerUrls.includes(url);
        const childContainerUrls = containerUrls.filter((containerUrl) => safeContainerUrl(containerUrl) === url);

        if (!exists && childContainerUrls.length === 0) {
            throw new DocumentNotFound(url);
        }

        const document = await this.readContainerDocumentMeta(url);
        const subject = new RDFNamedNode(document.url);
        const childrenUrls = exists
            ? await this.withDocumentsTransaction(document.url, 'readonly', (transaction) => {
                return transaction.store.getAllKeys();
            })
            : [];

        childrenUrls.push(...childContainerUrls);

        document.addQuads(
            childrenUrls.map((child) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(child))),
        );

        return document;
    }

    private async readContainerDocumentMeta(url: string): Promise<SolidDocument> {
        const containerUrl = requireSafeContainerUrl(url);

        if (!(await this.containerExists(containerUrl))) {
            return new SolidDocument(
                url,
                await jsonldToQuads({ '@id': url, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] }),
            );
        }

        const document = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
            return transaction.store.get(url);
        });

        return new SolidDocument(
            url,
            await jsonldToQuads(document?.graph ?? { '@id': url, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] }),
        );
    }

    private async createContainer(url: string): Promise<void> {
        if (await this.containerExists(url)) {
            return;
        }

        await this.withMetadataTransaction('readwrite', (transaction) => {
            return transaction.store.add({ url });
        });

        if (this.documentsConnection) {
            const connection = await this.documentsConnection;

            connection.close();
            this.documentsConnection = null;
        }
    }

    private async containerExists(url: string): Promise<boolean> {
        const containerUrls = await this.getContainerUrls();

        return containerUrls.includes(url);
    }

    private async getContainerUrls(): Promise<string[]> {
        const documents = await this.withMetadataTransaction('readonly', (transaction) => {
            return transaction.store.getAll();
        });

        return documents.map((document) => document.url);
    }

    private async withMetadataTransaction<TResult, TMode extends IDBTransactionMode>(
        mode: TMode,
        operation: (transaction: IDBPTransaction<MetadataSchema, ['containers'], TMode>) => Promise<TResult>,
    ): Promise<TResult> {
        const connection = await this.getMetadataConnection();
        const transaction = connection.transaction('containers', mode);

        return operation(transaction);
    }

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        containerUrl: string,
        mode: TMode,
        operation: (transaction: IDBPTransaction<DocumentsSchema, ['[containerUrl]'], TMode>) => Promise<TResult>,
    ): Promise<TResult> {
        if (!(await this.containerExists(containerUrl))) {
            if (mode !== 'readwrite') {
                throw new SoukaiError(`[IndexedDBEngine] Can't read container '${containerUrl}', does not exist`);
            }

            await this.createContainer(containerUrl);
        }

        const connection = await this.getDocumentsConnection();
        const transaction = connection.transaction(containerUrl as '[containerUrl]', mode);

        return operation(transaction);
    }

    private async getMetadataConnection(): Promise<IDBPDatabase<MetadataSchema>> {
        if (this.metadataConnection) {
            return this.metadataConnection;
        }

        return (this.metadataConnection = openDB<MetadataSchema>(`${this.database}-meta`, 1, {
            upgrade(db) {
                if (db.objectStoreNames.contains('containers')) {
                    return;
                }

                db.createObjectStore('containers', { keyPath: 'url' });
            },
        }));
    }

    private async getDocumentsConnection(): Promise<IDBPDatabase<DocumentsSchema>> {
        if (this.documentsConnection) {
            return this.documentsConnection;
        }

        const containerUrls = await this.getContainerUrls();

        return (this.documentsConnection = openDB<DocumentsSchema>(this.database, containerUrls.length + 1, {
            upgrade(database) {
                for (const containerUrl of containerUrls) {
                    if (database.objectStoreNames.contains(containerUrl as '[containerUrl]')) {
                        continue;
                    }

                    database.createObjectStore(containerUrl as '[containerUrl]', { keyPath: 'url' });
                }
            },
        }));
    }

}
