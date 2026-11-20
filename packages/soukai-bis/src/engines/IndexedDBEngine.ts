import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads } from '@noeldemartin/solid-utils';
import type { JsonLD, JsonLDGraph, SolidResponse } from '@noeldemartin/solid-utils';
import {
    PromisedValue,
    arrayChunk,
    arrayUnique,
    deepEquals,
    fail,
    isTruthy,
    objectEntries,
    objectFromEntries,
    silenced,
    tap,
} from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type { IDBPIndex, IDBPObjectStore, IDBPTransaction } from 'idb';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import ContainersIndex from 'soukai-bis/lib/internals/ContainersIndex';
import { parseIDBQuads, serializeIDBQuads } from 'soukai-bis/lib/internals/idb-quads';
import { LDP_CONTAINS_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import type {
    LocalDocument,
    LocalDocumentChanges,
    SoukaiIndexedDBSchema,
} from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import { requireSafeContainerUrl } from 'soukai-bis/lib/internals/urls';

import LocalEngine from './LocalEngine';
import type {
    DocumentLocalChanges,
    LocalChangesUpdate,
    LocalEngineDeleteOptions,
    LocalEngineReadOptions,
    LocalEngineWriteOptions,
    LocalFile,
    PurgeMetadataOptions,
} from './LocalEngine';
import type EngineOperation from './operations/EngineOperation';

export default class IndexedDBEngine extends LocalEngine {
    public static readonly engineName = 'IndexedDBEngine';

    private containersIndexCache: PromisedValue<ContainersIndex> | null = null;
    private removeIndexedDBListener: (() => void) | null = null;

    public async createDocument(
        url: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        options?: LocalEngineWriteOptions,
    ): Promise<SolidDocument> {
        await this.assertDocumentDoesNotExist(url);

        const containerUrl = requireSafeContainerUrl(url);
        const allQuads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const quads = url.endsWith('/') ? this.filterContainerQuads(allQuads, { keepTypes: true }) : allQuads;
        const resources = serializeIDBQuads(quads);

        const localChangesUpdated = await this.withDocumentsTransaction(
            containerUrl,
            'readwrite',
            async (transaction) => {
                await transaction.objectStore('documents').add({
                    url,
                    containerUrl,
                    resources,
                    lastModifiedAt: options?.lastModifiedAt,
                    status: this.getDocumentStatus(url, quads),
                });

                return this.writeLocalChanges(transaction, url, containerUrl, options?.localChanges);
            },
        );

        localChangesUpdated && (await this.emitLocalChangesUpdated());

        return new SolidDocument(url, quads);
    }

    public async readDocument(url: string, options: LocalEngineReadOptions = {}): Promise<SolidDocument> {
        if (url.endsWith('/')) {
            return this.readContainerDocument(url, options);
        }

        const containerUrl = requireSafeContainerUrl(url);
        const containerExists = await this.containerExists(containerUrl);

        if (!containerExists) {
            throw new DocumentNotFound(url);
        }

        const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) =>
            transaction.objectStore('documents').get(url),
        );

        return (
            (localDocument &&
                this.toReadableDocument(url, parseIDBQuads(localDocument.resources), localDocument.status, options)) ??
            fail<SolidDocument>(DocumentNotFound, url)
        );
    }

    public async updateDocument(
        url: string,
        operations: EngineOperation[],
        options?: LocalEngineWriteOptions,
    ): Promise<SolidResponse | null> {
        const isContainer = url.endsWith('/');
        const updateOperations = this.filterDocumentOperations(url, operations);

        if (this.isEmptyUpdate(updateOperations, options)) {
            return null;
        }

        const containerUrl = requireSafeContainerUrl(url);
        const containerExists = await this.containerExists(containerUrl);

        if (!isContainer && !containerExists) {
            throw new DocumentNotFound(url);
        }

        const localChangesUpdated = await this.withDocumentsTransaction(
            containerUrl,
            'readwrite',
            async (transaction) => {
                const documentsStore = transaction.objectStore('documents');
                const document = await documentsStore.get(url);

                if (!document) {
                    if (!isContainer) {
                        throw new DocumentNotFound(url);
                    }

                    await documentsStore.add({
                        url,
                        containerUrl,
                        resources: serializeIDBQuads(this.containerQuads(url)),
                        lastModifiedAt: options?.lastModifiedAt,
                    });

                    return this.writeLocalChanges(transaction, url, containerUrl, options?.localChanges);
                }

                const quads = this.applyOperations(parseIDBQuads(document.resources), updateOperations);

                await documentsStore.put({
                    url,
                    containerUrl,
                    resources: serializeIDBQuads(quads),
                    lastModifiedAt: this.getUpdatedLastModifiedAt(document.lastModifiedAt, options),
                    status: this.getDocumentStatus(url, quads),
                });

                return this.writeLocalChanges(transaction, url, containerUrl, options?.localChanges);
            },
        );

        localChangesUpdated && (await this.emitLocalChangesUpdated());

        return { headers: new Headers() };
    }

    public async dropContainers(containerUrls: string[] | RegExp): Promise<void> {
        const containerMatches = this.containerMatcher(containerUrls);

        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(['containers', 'documents', 'localChanges', 'files'], 'readwrite');
        const containersStore = transaction.objectStore('containers');
        const documentsStore = transaction.objectStore('documents');
        const localChangesStore = transaction.objectStore('localChanges');
        const filesStore = transaction.objectStore('files');
        const containersMetadata = await containersStore.getAll();
        let localChangesUpdated = false;

        for (const containerMetadata of containersMetadata) {
            if (!containerMatches(containerMetadata.url)) {
                continue;
            }

            await this.containersIndexCache?.then((index) => index.delete(containerMetadata.url));
            await containersStore.delete(containerMetadata.url);

            const documentKeys = await documentsStore.index('containerUrl').getAllKeys(containerMetadata.url);

            for (const key of documentKeys) {
                await documentsStore.delete(key);
            }

            const fileKeys = await filesStore.index('containerUrl').getAllKeys(containerMetadata.url);

            for (const key of fileKeys) {
                await filesStore.delete(key);
            }

            const localChangesKeys = await localChangesStore.index('containerUrl').getAllKeys(containerMetadata.url);

            for (const key of localChangesKeys) {
                await localChangesStore.delete(key);
            }

            localChangesUpdated ||=
                localChangesKeys.length > 0 || (await localChangesStore.count(containerMetadata.url)) > 0;

            await localChangesStore.delete(containerMetadata.url);
        }

        await transaction.done;

        localChangesUpdated && (await this.emitLocalChangesUpdated());
    }

    public async deleteDocument(url: string, options: LocalEngineDeleteOptions = {}): Promise<SolidResponse> {
        const containerUrl = requireSafeContainerUrl(url);

        if (!(await this.containerExists(containerUrl))) {
            throw new DocumentNotFound(url);
        }

        const result = await this.withDocumentsTransaction(containerUrl, 'readwrite', async (transaction) => {
            const documentsStore = transaction.objectStore('documents');
            const document = await documentsStore.get(url);

            if (!document) {
                return 'not-found';
            }

            if (options.ifMatch && document.status !== options.ifMatch.status) {
                return 'precondition-failed';
            }

            const localChangesStore = transaction.objectStore('localChanges');
            const hadLocalChanges = (await localChangesStore.count(url)) > 0;

            await documentsStore.delete(url);
            await localChangesStore.delete(url);

            return hadLocalChanges ? 'deleted-with-local-changes' : 'deleted';
        });

        if (result === 'not-found') {
            throw new DocumentNotFound(url);
        }

        if (result === 'precondition-failed') {
            throw new PreconditionFailed('deleting', url);
        }

        if (result === 'deleted-with-local-changes') {
            await this.emitLocalChangesUpdated();
        }

        return { headers: new Headers() };
    }

    public async getDocumentLocalChanges(documentUrl: string): Promise<DocumentLocalChanges | null> {
        const connection = await SoukaiIndexedDB.connect();
        const record = await connection.get('localChanges', documentUrl);

        return record ? this.toDocumentLocalChanges(record) : null;
    }

    public async getDocumentsLocalChanges(): Promise<Record<string, DocumentLocalChanges>> {
        const connection = await SoukaiIndexedDB.connect();
        const records = await connection.getAll('localChanges');

        return Object.fromEntries(records.map((record) => [record.documentUrl, this.toDocumentLocalChanges(record)]));
    }

    public async getFile(url: string): Promise<LocalFile | null> {
        const connection = await SoukaiIndexedDB.connect();

        return (await connection.get('files', url)) ?? null;
    }

    public async getFiles(options: { containerUrl?: string } = {}): Promise<LocalFile[]> {
        const connection = await SoukaiIndexedDB.connect();

        return options.containerUrl
            ? connection.getAllFromIndex('files', 'containerUrl', options.containerUrl)
            : connection.getAll('files');
    }

    public async purgeMetadata(options: PurgeMetadataOptions = {}): Promise<void> {
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

    public async *readDocumentsInBatches(
        containerUrl: string,
        options: { deep?: boolean; depth?: number; batchSize?: number } = {},
    ): AsyncGenerator<Record<string, SolidDocument>> {
        const { batchSize = 50, ...containerOptions } = options;
        const documentUrls = await this.getContainerDocumentUrls(containerUrl, containerOptions);

        for (const urls of arrayChunk(documentUrls, batchSize)) {
            yield this.readDocumentsByUrl(urls);
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

    public async countDocuments(options: { containerUrl: string; deep?: boolean; depth?: number }): Promise<number> {
        const { containerUrl, ...containerOptions } = options;
        const documentUrls = await this.getContainerDocumentUrls(containerUrl, containerOptions);

        return documentUrls.length;
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
        this.removeIndexedDBListener?.();
        this.removeIndexedDBListener = null;

        await SoukaiIndexedDB.close();
    }

    public async clear(): Promise<void> {
        await this.close();
        await SoukaiIndexedDB.clear();

        this.containersIndexCache = null;

        await this.emitLocalChangesUpdated();
    }

    protected async putFile(
        file: LocalFile,
        options: { localChanges?: Nullable<LocalChangesUpdate> } = {},
    ): Promise<void> {
        const localChangesUpdated = await this.withDocumentsTransaction(
            file.containerUrl,
            'readwrite',
            async (transaction) => {
                await transaction.objectStore('files').put(file);

                return this.writeLocalChanges(transaction, file.url, file.containerUrl, options.localChanges);
            },
        );

        localChangesUpdated && (await this.emitLocalChangesUpdated());
    }

    protected async removeFile(url: string): Promise<void> {
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(['files', 'localChanges'], 'readwrite');
        const localChangesStore = transaction.objectStore('localChanges');
        const hadLocalChanges = (await localChangesStore.count(url)) > 0;

        await transaction.objectStore('files').delete(url);
        await localChangesStore.delete(url);
        await transaction.done;

        hadLocalChanges && (await this.emitLocalChangesUpdated());
    }

    protected async readDocumentsByUrl(
        urls: string[],
        options: LocalEngineReadOptions = {},
    ): Promise<Record<string, SolidDocument>> {
        const documents: Record<string, SolidDocument | null> = {};
        const documentUrlsByContainer: Record<string, string[]> = {};

        for (const url of urls) {
            if (url.endsWith('/')) {
                documents[url] = await silenced(this.readContainerDocument(url, options));

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
                    const document =
                        localDocument &&
                        this.toReadableDocument(
                            url,
                            parseIDBQuads(localDocument.resources),
                            localDocument.status,
                            options,
                        );

                    if (!document) {
                        continue;
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
        readOptions: LocalEngineReadOptions = {},
    ): Promise<Record<string, SolidDocument>> {
        const containersIndex = await this.getContainersIndex();

        if (!containersIndex.has(containerUrl) && !containersIndex.childrenOf(containerUrl)) {
            throw new DocumentNotFound(containerUrl);
        }

        const { documents, containerUrls } = await this.queryContainerDocuments(containerUrl, options, {
            root: (store) => store.get(containerUrl),
            children: (index, query) => index.getAll(query),
        });
        const documentsByUrl = new Map<string, LocalDocument>();
        const documentsByContainer = new Map<string, LocalDocument[]>();

        for (const document of documents) {
            if (document.status === 'empty' && !readOptions.includeEmptyDocuments) {
                continue;
            }

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
            documentsByUrl,
            documentsByContainer,
            containersIndex,
        });
    }

    private async getContainerDocumentUrls(
        containerUrl: string,
        options: { deep?: boolean; depth?: number },
    ): Promise<string[]> {
        const containersIndex = await this.getContainersIndex();

        if (!containersIndex.has(containerUrl) && !containersIndex.childrenOf(containerUrl)) {
            throw new DocumentNotFound(containerUrl);
        }

        const { documents: documentUrls, containerUrls } = await this.queryContainerDocuments(containerUrl, options, {
            root: (store) => store.getKey(containerUrl),
            children: (index, query) => index.getAllKeys(query),
        });
        const emptyDocumentUrls = await this.getEmptyDocumentUrls();

        return arrayUnique([...containerUrls, ...documentUrls]).filter((url) => !emptyDocumentUrls.has(url));
    }

    private async queryContainerDocuments<T>(
        containerUrl: string,
        options: { deep?: boolean; depth?: number },
        queries: {
            root(store: IDBPObjectStore<SoukaiIndexedDBSchema, ['documents'], 'documents'>): Promise<T | undefined>;
            children(
                index: IDBPIndex<SoukaiIndexedDBSchema, ['documents'], 'documents', 'containerUrl'>,
                query: string | IDBKeyRange,
            ): Promise<T[]>;
        },
    ): Promise<{ documents: T[]; containerUrls: Set<string> }> {
        const containerUrls = new Set(await this.getContainerUrls({ from: containerUrl, ...options }));
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction('documents', 'readonly');
        const index = transaction.store.index('containerUrl');
        const rootDocument = await queries.root(transaction.store);
        const childDocuments =
            options.deep === true
                ? await queries.children(index, IDBKeyRange.bound(containerUrl, containerUrl + '\uffff'))
                : await Promise.all(Array.from(containerUrls).map((url) => queries.children(index, url))).then(
                      (results) => results.flat(),
                  );

        await transaction.done;

        return {
            documents: childDocuments.concat(rootDocument ? [rootDocument] : []),
            containerUrls,
        };
    }

    private async getContainersIndex(): Promise<ContainersIndex> {
        if (!this.containersIndexCache) {
            const promised = (this.containersIndexCache = new PromisedValue());
            this.removeIndexedDBListener ??= SoukaiIndexedDB.listeners.add({
                onCleared: () => this.onIndexedDBCleared(),
            });

            try {
                const connection = await SoukaiIndexedDB.connect();
                const transaction = connection.transaction('containers', 'readonly');
                const documents = await transaction.store.getAll();

                const urls = documents.map((document) => document.url);
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
        documentsByUrl,
        documentsByContainer,
        containersIndex,
    }: {
        containerUrls: Set<string>;
        documentsByUrl: Map<string, LocalDocument>;
        documentsByContainer: Map<string, LocalDocument[]>;
        containersIndex: ContainersIndex;
    }): Promise<Record<string, SolidDocument>> {
        const connection = await SoukaiIndexedDB.connect();
        const containerFiles = new Map(
            await Promise.all(
                Array.from(containerUrls).map(
                    async (url) => [url, await connection.getAllFromIndex('files', 'containerUrl', url)] as const,
                ),
            ),
        );
        const containerDocuments = Array.from(containerUrls).map((url) => {
            const subject = new RDFNamedNode(url);
            const localDocument = documentsByUrl.get(url);
            const document = new SolidDocument(
                url,
                localDocument ? parseIDBQuads(localDocument.resources) : this.containerQuads(url),
            );

            const childrenUrls = (documentsByContainer.get(url) ?? [])
                .map((doc) => doc.url)
                .concat(Array.from(containersIndex.childrenOf(url) ?? []));

            document.addQuads(
                arrayUnique(childrenUrls).map(
                    (childUrl) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(childUrl)),
                ),
            );
            document.addQuads(this.containerFilesQuads(url, containerFiles.get(url) ?? []));

            return document;
        });

        const nonContainerDocuments = Array.from(documentsByUrl.values())
            .filter((localDocument) => !localDocument.url.endsWith('/'))
            .map((localDocument) => new SolidDocument(localDocument.url, parseIDBQuads(localDocument.resources)));

        return objectFromEntries(
            containerDocuments.concat(nonContainerDocuments).map((document) => [document.url, document]),
        );
    }

    private async readContainerDocument(url: string, options: LocalEngineReadOptions): Promise<SolidDocument> {
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

        const hiddenDocumentUrls = options.includeEmptyDocuments ? new Set() : await this.getEmptyDocumentUrls();

        document.addQuads(
            arrayUnique(childrenUrls.filter((childUrl) => !hiddenDocumentUrls.has(childUrl))).map(
                (child) => new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(child)),
            ),
        );

        if (exists) {
            document.addQuads(this.containerFilesQuads(url, await this.getFiles({ containerUrl: url })));
        }

        return document;
    }

    private async readContainerDocumentMeta(url: string): Promise<SolidDocument> {
        const containerUrl = requireSafeContainerUrl(url);
        const defaultQuads = this.containerQuads(url);

        if (!(await this.containerExists(containerUrl))) {
            return new SolidDocument(url, defaultQuads);
        }

        const localDocument = await this.withDocumentsTransaction(containerUrl, 'readonly', (transaction) => {
            return transaction.objectStore('documents').get(url);
        });

        return new SolidDocument(url, localDocument ? parseIDBQuads(localDocument.resources) : defaultQuads);
    }

    private async getEmptyDocumentUrls(): Promise<Set<string>> {
        const connection = await SoukaiIndexedDB.connect();

        return new Set(await connection.getAllKeysFromIndex('documents', 'status', 'empty'));
    }

    private toDocumentLocalChanges(record: LocalDocumentChanges): DocumentLocalChanges {
        return { resources: record.resources };
    }

    private async writeLocalChanges(
        transaction: IDBPTransaction<
            SoukaiIndexedDBSchema,
            readonly ['documents', 'containers', 'localChanges', 'files'],
            'readwrite'
        >,
        documentUrl: string,
        containerUrl: string,
        update?: Nullable<LocalChangesUpdate>,
    ): Promise<boolean> {
        if (!update) {
            return false;
        }

        const store = transaction.objectStore('localChanges');
        const record = await store.get(documentUrl);
        const previousChanges = record ? this.toDocumentLocalChanges(record) : null;
        const changes = this.applyLocalChangesUpdate(previousChanges, update);

        if (changes) {
            await store.put({ documentUrl, containerUrl, ...changes });
        } else if (previousChanges) {
            await store.delete(documentUrl);
        }

        return !deepEquals(previousChanges, changes);
    }

    private async containerExists(url: string): Promise<boolean> {
        const index = await this.getContainersIndex();

        return index.has(url);
    }

    private async onIndexedDBCleared(): Promise<void> {
        if (this.containersIndexCache && !this.containersIndexCache.isResolved()) {
            this.containersIndexCache.reject(new SoukaiError('IndexedDB was cleared while loading containers index'));
        }

        this.containersIndexCache = null;

        await this.emitLocalChangesUpdated();
    }

    private async withDocumentsTransaction<TResult, TMode extends IDBTransactionMode>(
        containerUrl: string,
        mode: TMode,
        operation: (
            transaction: IDBPTransaction<
                SoukaiIndexedDBSchema,
                readonly ['documents', 'containers', 'localChanges', 'files'],
                TMode
            >,
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
        const transaction = connection.transaction(['documents', 'containers', 'localChanges', 'files'] as const, mode);

        const result = await operation(transaction);

        await transaction.done;

        return result;
    }
}
