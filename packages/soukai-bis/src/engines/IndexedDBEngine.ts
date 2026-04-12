import { deleteDB, openDB } from 'idb';
import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { Semaphore } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/utils/urls';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import Engine from './Engine';
import type EngineOperation from './operations/EngineOperation';

export interface LocalDocument {
    url: string;
    graph: JsonLD;
    lastModifiedAt?: Nullable<Date>;
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
            dropped?: true;
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

    public async createDocument(
        url: string,
        contents: JsonLD | Quad[],
        metadata?: { lastModifiedAt?: Nullable<Date> },
    ): Promise<SolidDocument> {
        return this.lock.run(async () => {
            const containerUrl = requireSafeContainerUrl(url);

            return this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                if (await transaction.store.get(url)) {
                    throw new DocumentAlreadyExists(url);
                }

                const quads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
                const graph = Array.isArray(contents) ? await quadsToJsonLD(contents) : contents;

                if (url.endsWith('/')) {
                    this.removeContainerProperties(graph, { keepTypes: true });
                }

                await transaction.store.add({ url, graph, lastModifiedAt: metadata?.lastModifiedAt });

                return new SolidDocument(
                    url,
                    quads,
                    metadata?.lastModifiedAt ? new Headers({ Date: metadata.lastModifiedAt.toUTCString() }) : undefined,
                );
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

            const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
                return transaction.store.get(url);
            });

            if (!localDocument) {
                throw new DocumentNotFound(url);
            }

            const document = new SolidDocument(url, await jsonldToQuads(localDocument.graph));

            if (localDocument.lastModifiedAt) {
                document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
            }

            return document;
        });
    }

    public async updateDocument(
        url: string,
        operations: EngineOperation[],
        metadata?: { lastModifiedAt?: Nullable<Date> },
    ): Promise<void> {
        operations = url.endsWith('/') ? this.filterContainerOperations(operations) : operations;

        if (operations.length === 0 && !metadata?.lastModifiedAt) {
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

                return transaction.store.put({
                    url,
                    graph: await quadsToJsonLD(quads),
                    lastModifiedAt: metadata?.lastModifiedAt,
                });
            });
        });
    }

    public async dropContainers(containerUrls: string[]): Promise<void> {
        await this.lock.run(async () => {
            await this.withMetadataTransaction('readwrite', async (transaction) => {
                for (const containerUrl of containerUrls) {
                    const existingContainer = await transaction.store.get(containerUrl);

                    if (!existingContainer || existingContainer.dropped) {
                        continue;
                    }

                    await transaction.store.put({ url: containerUrl, dropped: true });
                }
            });

            await this.syncContainerStores();
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

    public async getContainerUrls(): Promise<string[]> {
        const documents = await this.getContainersMetadata();

        return documents.filter((document) => !document.dropped).map((document) => document.url);
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

    public async clear(): Promise<void> {
        await this.lock.run(async () => {
            await this.close();
            await Promise.all([
                deleteDB(`${this.database}-meta`, { blocked: () => this.throwDatabaseBlockedError() }),
                deleteDB(this.database, { blocked: () => this.throwDatabaseBlockedError() }),
            ]);
        });
    }

    private async readContainerDocument(url: string): Promise<SolidDocument> {
        const containerUrls = await this.getContainerUrls();
        const virtualContainerUrls = this.getVirtualContainerUrls(containerUrls);
        const exists = containerUrls.includes(url);
        const childContainerUrls = virtualContainerUrls.filter(
            (containerUrl) => safeContainerUrl(containerUrl) === url,
        );

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

        const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
            return transaction.store.get(url);
        });

        const document = new SolidDocument(
            url,
            await jsonldToQuads(localDocument?.graph ?? { '@id': url, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] }),
        );

        if (localDocument?.lastModifiedAt) {
            document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
        }

        return document;
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

    private async getContainersMetadata(): Promise<{ url: string; dropped?: true }[]> {
        const documents = await this.withMetadataTransaction('readonly', (transaction) => {
            return transaction.store.getAll();
        });

        return documents;
    }

    private getVirtualContainerUrls(containerUrls: string[]): string[] {
        const virtualContainerUrls = new Set(containerUrls);

        for (const containerUrl of containerUrls) {
            let url: string | null = containerUrl;

            while ((url = safeContainerUrl(url))) {
                virtualContainerUrls.add(url);
            }
        }

        return Array.from(virtualContainerUrls);
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
            blocked: () => this.throwDatabaseBlockedError(),
        }));
    }

    private async getDocumentsConnection(): Promise<IDBPDatabase<DocumentsSchema>> {
        if (this.documentsConnection) {
            return this.documentsConnection;
        }

        const containers = await this.getContainersMetadata();

        return (this.documentsConnection = openDB<DocumentsSchema>(this.database, containers.length + 1, {
            upgrade(database) {
                for (const container of containers) {
                    if (container.dropped && database.objectStoreNames.contains(container.url as '[containerUrl]')) {
                        database.deleteObjectStore(container.url as '[containerUrl]');
                    }

                    if (!container.dropped && !database.objectStoreNames.contains(container.url as '[containerUrl]')) {
                        database.createObjectStore(container.url as '[containerUrl]', { keyPath: 'url' });
                    }
                }
            },
            blocked: () => this.throwDatabaseBlockedError(),
        }));
    }

    private async syncContainerStores(): Promise<void> {
        await this.close();
        await this.getDocumentsConnection();
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError(
            'An attempt to open an IndexedDB connection has been blocked, ' +
                'remember to call IndexedDBEngine.close() when necessary. ',
        );
    }

}
