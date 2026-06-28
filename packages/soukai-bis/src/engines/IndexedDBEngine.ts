import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { PromisedValue, arrayUnique, isTruthy, objectEntries, objectFromEntries, silenced } from '@noeldemartin/utils';
import type { IDBPTransaction } from 'idb';
import type { JsonLD, JsonLDGraph, SolidResponse } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/utils/urls';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import Engine from './Engine';
import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import type EngineOperation from './operations/EngineOperation';
import type ManagesContainers from './contracts/ManagesContainers';
import type PurgesMetadata from './contracts/PurgesMetadata';
import type ManagesDocuments from './contracts/ManagesDocuments';
import type { GetDocumentUrlsOptions } from './contracts/ManagesDocuments';
import type { EngineMetadata } from './Engine';
import type { SoukaiIndexedDBSchema } from 'soukai-bis/lib/SoukaiIndexedDB';

export default class IndexedDBEngine extends Engine implements ManagesContainers, PurgesMetadata, ManagesDocuments {

    public static readonly engineName = 'IndexedDBEngine';

    private containerUrlsCache: PromisedValue<Set<string>> | null = null;

    public constructor() {
        super();
    }

    public async createDocument(
        url: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        metadata?: EngineMetadata,
    ): Promise<SolidDocument> {
        const existingDocument = await this.readDocumentIfExists(url);

        if (existingDocument) {
            throw new DocumentAlreadyExists(url, existingDocument);
        }

        const containerUrl = requireSafeContainerUrl(url);
        const quads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const graph = Array.isArray(contents) ? await quadsToJsonLD(contents) : contents;

        if (url.endsWith('/')) {
            this.removeContainerProperties(graph, { keepTypes: true });
        }

        return this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
            await transaction.objectStore('documents').add({
                url,
                containerUrl,
                graph,
                lastModifiedAt: metadata?.lastModifiedAt,
            });

            return new SolidDocument(
                url,
                quads,
                metadata?.lastModifiedAt ? new Headers({ Date: metadata.lastModifiedAt.toUTCString() }) : undefined,
            );
        });
    }

    public async readDocument(url: string): Promise<SolidDocument> {
        if (url.endsWith('/')) {
            return this.readContainerDocument(url);
        }

        const containerUrl = requireSafeContainerUrl(url);
        const containerExists = await this.containerExists(containerUrl);

        if (!containerExists) {
            throw new DocumentNotFound(url);
        }

        const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
            return transaction.objectStore('documents').get(url);
        });

        if (!localDocument) {
            throw new DocumentNotFound(url);
        }

        const document = new SolidDocument(url, await jsonldToQuads(localDocument.graph));

        if (localDocument.lastModifiedAt) {
            document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
        }

        return document;
    }

    public async readDocuments(urls: string[]): Promise<Record<string, SolidDocument>> {
        const documents: Record<string, SolidDocument | null> = {};
        const documentUrlsByContainer: Record<string, string[]> = {};

        for (const url of urls) {
            if (url.endsWith('/')) {
                documents[url] = await silenced(this.readContainerDocument(url));

                continue;
            }

            const containerUrl = requireSafeContainerUrl(url);

            documentUrlsByContainer[containerUrl] ??= [];
            documentUrlsByContainer[containerUrl].push(url);
        }

        await Promise.all(
            Object.entries(documentUrlsByContainer).map(async ([containerUrl, containerDocumentUrls]) => {
                const containerExists = await this.containerExists(containerUrl);

                if (!containerExists) {
                    return;
                }

                const idbDocumentsMap = await this.withDocumentsTransaction(
                    containerUrl,
                    'readonly',
                    async (transaction) => {
                        const idbDocuments = await Promise.all(
                            containerDocumentUrls.map((url) => transaction.objectStore('documents').get(url)),
                        );

                        return Object.fromEntries(idbDocuments.filter(isTruthy).map((result) => [result.url, result]));
                    },
                );

                for (const url of containerDocumentUrls) {
                    const localDocument = idbDocumentsMap[url];

                    if (!localDocument) {
                        continue;
                    }

                    const document = new SolidDocument(url, await jsonldToQuads(localDocument.graph));

                    if (localDocument.lastModifiedAt) {
                        document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
                    }

                    documents[url] = document;
                }
            }),
        );

        return objectFromEntries(
            objectEntries(documents).filter((entry): entry is [string, SolidDocument] => !!entry[1]),
        );
    }

    public async updateDocument(
        url: string,
        operations: EngineOperation[],
        metadata?: EngineMetadata,
    ): Promise<SolidResponse | null> {
        const isContainer = url.endsWith('/');

        operations = isContainer ? this.filterContainerOperations(operations) : operations;

        if (operations.length === 0 && !metadata?.lastModifiedAt) {
            return null;
        }

        const containerUrl = requireSafeContainerUrl(url);
        const containerExists = await this.containerExists(containerUrl);

        if (!isContainer && !containerExists) {
            throw new DocumentNotFound(url);
        }

        const document = containerExists
            ? await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
                return transaction.objectStore('documents').get(url);
            })
            : undefined;

        if (!document) {
            if (url.endsWith('/')) {
                const graph = { '@graph': [{ '@id': url, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] }] };

                await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                    await transaction.objectStore('documents').add({
                        url,
                        containerUrl,
                        graph,
                        lastModifiedAt: metadata?.lastModifiedAt,
                    });
                });

                return { headers: new Headers() };
            }

            throw new DocumentNotFound(url);
        }

        let quads = await jsonldToQuads(document.graph);

        for (const operation of operations) {
            quads = operation.applyToQuads(quads);
        }

        const graph = await quadsToJsonLD(quads);

        await this.withDocumentsTransaction(containerUrl, 'readwrite', (transaction) => {
            return transaction.objectStore('documents').put({
                url,
                containerUrl,
                graph,
                lastModifiedAt: metadata?.lastModifiedAt,
            });
        });

        return { headers: new Headers() };
    }

    public async dropContainers(containerUrls: string[] | RegExp): Promise<void> {
        const containerMatches = Array.isArray(containerUrls)
            ? (url: string) => containerUrls.includes(url)
            : (url: string) => containerUrls.test(url);

        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(['containers', 'documents'], 'readwrite');
        const containersStore = transaction.objectStore('containers');
        const documentsStore = transaction.objectStore('documents');
        const containersMetadata = await containersStore.getAll();

        for (const containerMetadata of containersMetadata) {
            if (containerMetadata.dropped || !containerMatches(containerMetadata.url)) {
                continue;
            }

            await this.containerUrlsCache?.then((cache) => cache.delete(containerMetadata.url));
            await containersStore.put({ url: containerMetadata.url, dropped: true });

            const documentKeys = await documentsStore.index('containerUrl').getAllKeys(containerMetadata.url);

            for (const key of documentKeys) {
                await documentsStore.delete(key);
            }
        }

        await transaction.done;
    }

    public async deleteDocument(url: string): Promise<SolidResponse> {
        const containerUrl = requireSafeContainerUrl(url);

        if (!(await this.containerExists(containerUrl))) {
            return { headers: new Headers() };
        }

        await this.withDocumentsTransaction(containerUrl, 'readwrite', (transaction) => {
            return transaction.objectStore('documents').delete(url);
        });

        return { headers: new Headers() };
    }

    public async purgeMetadata(): Promise<void> {
        for (const containerUrl of await this.getContainerUrls()) {
            await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                const documentsStore = transaction.objectStore('documents');
                const documents = await documentsStore.index('containerUrl').getAll(containerUrl);

                for (const document of documents) {
                    if (!document.lastModifiedAt) {
                        continue;
                    }

                    delete document.lastModifiedAt;
                    await documentsStore.put(document);
                }
            });
        }
    }

    public async getContainerUrls(): Promise<string[]> {
        const cache = await this.getContainerUrlsCache();

        return Array.from(cache);
    }

    private async getContainerUrlsCache(): Promise<Set<string>> {
        if (!this.containerUrlsCache) {
            const promised = (this.containerUrlsCache = new PromisedValue());

            try {
                const connection = await SoukaiIndexedDB.connect();
                const transaction = connection.transaction('containers', 'readonly');
                const documents = await transaction.store.getAll();

                const urls = documents.filter((document) => !document.dropped).map((document) => document.url);
                promised.resolve(new Set(urls));
            } catch (error) {
                promised.reject(error instanceof Error ? error : new Error(String(error)));

                if (this.containerUrlsCache === promised) {
                    this.containerUrlsCache = null;
                }

                return promised;
            }
        }

        return this.containerUrlsCache;
    }

    public async getDocumentUrls(options?: GetDocumentUrlsOptions): Promise<string[]> {
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction('documents', 'readonly');
        const store = transaction.store;
        const metadata = options?.metadata ?? {};

        if (metadata.lastModifiedAt === undefined) {
            return store.getAllKeys();
        }

        if (metadata.lastModifiedAt === null) {
            const allUrls = await store.getAllKeys();
            const syncedUrls = new Set(await store.index('lastModifiedAt').getAllKeys());

            return allUrls.filter((url) => !syncedUrls.has(url));
        }

        return store.index('lastModifiedAt').getAllKeys(metadata.lastModifiedAt);
    }

    public async close(): Promise<void> {
        await SoukaiIndexedDB.close();
    }

    public async clear(): Promise<void> {
        await this.close();
        await SoukaiIndexedDB.clear();
        this.containerUrlsCache = null;
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
                return transaction.objectStore('documents').index('containerUrl').getAllKeys(document.url);
            })
            : [];

        childrenUrls.push(...childContainerUrls);

        document.addQuads(
            arrayUnique(childrenUrls).map(
                (child) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(child)),
            ),
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
            return transaction.objectStore('documents').get(url);
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

    private async containerExists(url: string): Promise<boolean> {
        const cache = await this.getContainerUrlsCache();

        return cache.has(url);
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

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        containerUrl: string,
        mode: TMode,
        operation: (
            transaction: IDBPTransaction<SoukaiIndexedDBSchema, ['documents', 'containers'], TMode>
        ) => Promise<TResult>,
    ): Promise<TResult> {
        const containerExists = await this.containerExists(containerUrl);

        if (!containerExists) {
            if (mode !== 'readwrite') {
                throw new SoukaiError(`[IndexedDBEngine] Can't read container '${containerUrl}', does not exist`);
            }

            const connection = await SoukaiIndexedDB.connect();
            const transaction = connection.transaction('containers', 'readwrite');

            await transaction.store.put({ url: containerUrl });
            await transaction.done;
            await this.containerUrlsCache?.then((cache) => cache.add(containerUrl));
        }

        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(['documents', 'containers'], mode);

        const result = await operation(transaction);

        await transaction.done;

        return result;
    }

}
