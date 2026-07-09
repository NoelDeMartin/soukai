import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads } from '@noeldemartin/solid-utils';
import {
    PromisedValue,
    arrayUnique,
    isTruthy,
    objectEntries,
    objectFromEntries,
    silenced,
    tap,
} from '@noeldemartin/utils';
import type { IDBPTransaction } from 'idb';
import type { JsonLD, JsonLDGraph, SolidResponse } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl } from 'soukai-bis/utils/urls';
import { parseIDBQuads, serializeIDBQuads } from 'soukai-bis/utils/idb-quads';
import {
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS_PREDICATE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';

import Engine from './Engine';
import ContainersIndex from 'soukai-bis/lib/ContainersIndex';
import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import type EngineOperation from './operations/EngineOperation';
import type ManagesContainers from './contracts/ManagesContainers';
import type PurgesMetadata from './contracts/PurgesMetadata';
import type ManagesDocuments from './contracts/ManagesDocuments';
import type { GetDocumentUrlsOptions } from './contracts/ManagesDocuments';
import type { EngineMetadata } from './Engine';
import type { PurgesMetadataOptions } from './contracts/PurgesMetadata';
import type { LocalDocument, SoukaiIndexedDBSchema } from 'soukai-bis/lib/SoukaiIndexedDB';

export default class IndexedDBEngine extends Engine implements ManagesContainers, PurgesMetadata, ManagesDocuments {

    public static readonly engineName = 'IndexedDBEngine';

    private containersIndexCache: PromisedValue<ContainersIndex> | null = null;

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
        const allQuads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const quads = url.endsWith('/') ? this.filterContainerQuads(allQuads, { keepTypes: true }) : allQuads;
        const resources = serializeIDBQuads(quads);

        return this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
            await transaction.objectStore('documents').add({
                url,
                containerUrl,
                resources,
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

        const document = new SolidDocument(url, parseIDBQuads(localDocument.resources));

        if (localDocument.lastModifiedAt) {
            document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
        }

        return document;
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
                const subject = new RDFNamedNode(url);
                const quads = [
                    new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT),
                    new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT),
                ];
                const resources = serializeIDBQuads(quads);

                await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
                    await transaction.objectStore('documents').add({
                        url,
                        containerUrl,
                        resources,
                        lastModifiedAt: metadata?.lastModifiedAt,
                    });
                });

                return { headers: new Headers() };
            }

            throw new DocumentNotFound(url);
        }

        let quads = parseIDBQuads(document.resources);

        for (const operation of operations) {
            quads = operation.applyToQuads(quads);
        }

        const resources = serializeIDBQuads(quads);

        await this.withDocumentsTransaction(containerUrl, 'readwrite', (transaction) => {
            return transaction.objectStore('documents').put({
                url,
                containerUrl,
                resources,
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

            await this.containersIndexCache?.then((index) => index.delete(containerMetadata.url));
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

    public async purgeMetadata(options: PurgesMetadataOptions = {}): Promise<void> {
        if (options.documentUrls) {
            const connection = await SoukaiIndexedDB.connect();
            const transaction = connection.transaction('documents', 'readwrite');
            const documentsStore = transaction.objectStore('documents');

            for (const documentUrl of options.documentUrls) {
                const document = await documentsStore.get(documentUrl);

                if (!document || !document.lastModifiedAt) {
                    continue;
                }

                delete document.lastModifiedAt;

                await documentsStore.put(document);
            }

            await transaction.done;

            return;
        }

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

    public async getContainerUrls(options: { from?: string; deep?: boolean; depth?: number } = {}): Promise<string[]> {
        const index = await this.getContainersIndex();

        if (!options.from) {
            return index.getUrls();
        }

        const depth = options.depth ?? 0;
        const visited = new Set<string>();
        const queue = [{ url: options.from, level: 0 }];

        while (queue.length > 0) {
            const { url, level } = queue.shift() as (typeof queue)[number];

            if (visited.has(url)) {
                continue;
            }

            visited.add(url);

            if (!options.deep && level >= depth) {
                continue;
            }

            for (const child of index.childrenOf(url) ?? []) {
                queue.push({ url: child, level: level + 1 });
            }
        }

        return Array.from(visited);
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

    public async getDocumentsLastModifiedAt(): Promise<Record<string, Date | null>> {
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction('documents', 'readonly');
        const store = transaction.store;
        const index = store.index('lastModifiedAt');
        const timestamps: Record<string, Date | null> = {};
        const allUrls = await store.getAllKeys();

        for (const url of allUrls) {
            timestamps[url] = null;
        }

        let cursor = await index.openKeyCursor();

        while (cursor) {
            timestamps[cursor.primaryKey] = cursor.key as Date;

            cursor = await cursor.continue();
        }

        return timestamps;
    }

    public async close(): Promise<void> {
        await SoukaiIndexedDB.close();
    }

    public async clear(): Promise<void> {
        await this.close();
        await SoukaiIndexedDB.clear();
        this.containersIndexCache = null;
    }

    protected async readDocumentsByUrl(urls: string[]): Promise<Record<string, SolidDocument>> {
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

                    const document = new SolidDocument(url, parseIDBQuads(localDocument.resources));

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

    protected async readDocumentsByContainer(
        containerUrl: string,
        options: { deep?: boolean; depth?: number } = {},
    ): Promise<Record<string, SolidDocument>> {
        const containersIndex = await this.getContainersIndex();

        if (!containersIndex.has(containerUrl) && !containersIndex.childrenOf(containerUrl)) {
            throw new DocumentNotFound(containerUrl);
        }

        const { documents, containerUrls } = await this.getContainerDocumentsAndUrls(containerUrl, options);
        const documentsByUrl = new Map<string, LocalDocument>();
        const documentsByContainer = new Map<string, LocalDocument[]>();

        for (const document of documents) {
            const containerDocuments =
                documentsByContainer.get(document.containerUrl) ??
                tap([], (docs) => documentsByContainer.set(document.containerUrl, docs));

            documentsByUrl.set(document.url, document);
            containerDocuments.push(document);

            if (document.url.endsWith('/')) {
                containerUrls.add(document.url);
            }
        }

        return this.prepareSolidDocuments({
            containerUrls,
            documents,
            documentsByUrl,
            documentsByContainer,
            containersIndex,
        });
    }

    private async getContainerDocumentsAndUrls(
        containerUrl: string,
        options: { deep?: boolean; depth?: number } = {},
    ): Promise<{ documents: LocalDocument[]; containerUrls: Set<string> }> {
        const containerUrls = new Set(await this.getContainerUrls({ from: containerUrl, ...options }));
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction('documents', 'readonly');
        const rootDocument = await transaction.objectStore('documents').get(containerUrl);
        const childDocuments =
            options.deep === true
                ? await transaction
                    .objectStore('documents')
                    .index('containerUrl')
                    .getAll(IDBKeyRange.bound(containerUrl, containerUrl + '\uffff'))
                : await Promise.all(
                    Array.from(containerUrls).map((url) =>
                        transaction.objectStore('documents').index('containerUrl').getAll(url)),
                ).then((results) => results.flat());

        await transaction.done;

        return {
            documents: childDocuments.concat(rootDocument ? [rootDocument] : []),
            containerUrls,
        };
    }

    private async getContainersIndex(): Promise<ContainersIndex> {
        if (!this.containersIndexCache) {
            const promised = (this.containersIndexCache = new PromisedValue());
            const removeClearListener = SoukaiIndexedDB.addClearListener(() => {
                if (this.containersIndexCache !== promised) {
                    return;
                }

                if (!promised.isResolved()) {
                    promised.reject(new SoukaiError('IndexedDB was cleared while loading containers index'));
                }

                this.containersIndexCache = null;
            });

            promised.finally(removeClearListener);

            try {
                const connection = await SoukaiIndexedDB.connect();
                const transaction = connection.transaction('containers', 'readonly');
                const documents = await transaction.store.getAll();

                const urls = documents.filter((document) => !document.dropped).map((document) => document.url);
                promised.resolve(new ContainersIndex(new Set(urls)));
            } catch (error) {
                promised.reject(error instanceof Error ? error : new Error(String(error)));

                if (this.containersIndexCache === promised) {
                    this.containersIndexCache = null;
                }
            }

            return promised;
        }

        return this.containersIndexCache;
    }

    private async prepareSolidDocuments({
        containerUrls,
        documents,
        documentsByUrl,
        documentsByContainer,
        containersIndex,
    }: {
        containerUrls: Set<string>;
        documents: LocalDocument[];
        documentsByUrl: Map<string, LocalDocument>;
        documentsByContainer: Map<string, LocalDocument[]>;
        containersIndex: ContainersIndex;
    }): Promise<Record<string, SolidDocument>> {
        const containerDocuments = Array.from(containerUrls).map((url) => {
            const subject = new RDFNamedNode(url);
            const localDocument = documentsByUrl.get(url);
            const document = new SolidDocument(
                url,
                localDocument
                    ? parseIDBQuads(localDocument.resources)
                    : [
                        new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT),
                        new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT),
                    ],
            );

            if (localDocument?.lastModifiedAt) {
                document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
            }

            const childrenUrls = (documentsByContainer.get(url) ?? [])
                .map((doc) => doc.url)
                .concat(Array.from(containersIndex.childrenOf(url) ?? []));

            document.addQuads(
                arrayUnique(childrenUrls).map(
                    (childUrl) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(childUrl)),
                ),
            );

            return document;
        });

        const nonContainerDocuments = documents
            .filter((localDocument) => !localDocument.url.endsWith('/'))
            .map((localDocument) => {
                const document = new SolidDocument(localDocument.url, parseIDBQuads(localDocument.resources));

                if (localDocument.lastModifiedAt) {
                    document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
                }

                return document;
            });

        return objectFromEntries(
            containerDocuments.concat(nonContainerDocuments).map((document) => [document.url, document]),
        );
    }

    private async readContainerDocument(url: string): Promise<SolidDocument> {
        const containersIndex = await this.getContainersIndex();
        const exists = containersIndex.has(url);
        const childContainerUrls = containersIndex.childrenOf(url);

        if (!exists && !childContainerUrls) {
            throw new DocumentNotFound(url);
        }

        const document = await this.readContainerDocumentMeta(url);
        const subject = new RDFNamedNode(document.url);
        const childrenUrls = exists
            ? await this.withDocumentsTransaction(document.url, 'readonly', (transaction) => {
                return transaction.objectStore('documents').index('containerUrl').getAllKeys(document.url);
            })
            : [];

        childrenUrls.push(...(childContainerUrls ?? []));

        document.addQuads(
            arrayUnique(childrenUrls).map(
                (child) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(child)),
            ),
        );

        return document;
    }

    private async readContainerDocumentMeta(url: string): Promise<SolidDocument> {
        const containerUrl = requireSafeContainerUrl(url);
        const subject = new RDFNamedNode(url);
        const defaultQuads = [
            new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT),
            new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT),
        ];

        if (!(await this.containerExists(containerUrl))) {
            return new SolidDocument(url, defaultQuads);
        }

        const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
            return transaction.objectStore('documents').get(url);
        });

        const quads = localDocument ? parseIDBQuads(localDocument.resources) : defaultQuads;
        const document = new SolidDocument(url, quads);

        if (localDocument?.lastModifiedAt) {
            document.headers.set('Last-Modified', localDocument.lastModifiedAt.toUTCString());
        }

        return document;
    }

    private async containerExists(url: string): Promise<boolean> {
        const index = await this.getContainersIndex();

        return index.has(url);
    }

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        containerUrl: string,
        mode: TMode,
        operation: (
            transaction: IDBPTransaction<SoukaiIndexedDBSchema, readonly ['documents', 'containers'], TMode>
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
            await this.containersIndexCache?.then((index) => index.add(containerUrl));
        }

        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(['documents', 'containers'] as const, mode);

        const result = await operation(transaction);

        await transaction.done;

        return result;
    }

}
