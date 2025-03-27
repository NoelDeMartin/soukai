import {
    ListenersManager,
    arrayFrom,
    arrayUnique,
    fail,
    isObject,
    toString,
    urlParentDirectory,
    urlRoot,
} from '@noeldemartin/utils';
import { DocumentAlreadyExists, DocumentNotFound, EngineHelper, SoukaiError } from 'soukai';
import type {
    Engine,
    EngineAttributeLeafValue,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineRootFilter,
    EngineUpdateItemsOperatorData,
    EngineUpdates,
} from 'soukai';
import { compactJsonLDGraph, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { Listeners } from '@noeldemartin/utils';

import ChangeUrlOperation from 'soukai-solid/solid/operations/ChangeUrlOperation';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';
import RemovePropertyOperation from 'soukai-solid/solid/operations/RemovePropertyOperation';
import SolidClient from 'soukai-solid/solid/SolidClient';
import UpdatePropertyOperation from 'soukai-solid/solid/operations/UpdatePropertyOperation';
import { LDP_CONTAINER } from 'soukai-solid/solid/constants';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type { Fetch, ResponseMetadata } from 'soukai-solid/solid/SolidClient';
import type { LiteralValue } from 'soukai-solid/solid/RDFResourceProperty';
import type { RDFDocumentMetadata } from 'soukai-solid/solid/RDFDocument';
import type { UpdateOperation } from 'soukai-solid/solid/operations/Operation';

export interface SolidEngineConfig {
    /** @deprecated */
    useGlobbing: boolean;
    /** @deprecated */
    globbingBatchSize: number | null;
    concurrentFetchBatchSize: number | null;
    cachesDocuments: boolean;
}

export interface SolidEngineListener {
    onDocumentCreated?(url: string, metadata: RDFDocumentMetadata): unknown;
    onDocumentRead?(url: string, metadata: RDFDocumentMetadata): unknown;
    onDocumentUpdated?(url: string, metadata: ResponseMetadata): unknown;
    onDocumentDeleted?(url: string, metadata: ResponseMetadata): unknown;

    /** @deprecated Use onRDFDocumentRead instead */
    onRDFDocumentLoaded?(url: string, metadata: RDFDocumentMetadata): void;
}

export class SolidEngine implements Engine {

    public __isSolidEngine = true;

    private config: SolidEngineConfig;
    private helper: EngineHelper;
    private client: SolidClient;
    private cache: Map<string, RDFDocument | null> = new Map();
    private _listeners = new ListenersManager<SolidEngineListener>();

    public constructor(fetch?: Fetch, config: Partial<SolidEngineConfig> = {}) {
        this.helper = new EngineHelper();
        this.config = {
            useGlobbing: false,
            globbingBatchSize: 5,
            concurrentFetchBatchSize: 10,
            cachesDocuments: false,
            ...config,
        };
        this.client = new SolidClient(fetch);

        this.client.setConfig({
            useGlobbing: this.config.useGlobbing,
            concurrentFetchBatchSize: this.config.concurrentFetchBatchSize,
        });
    }

    public get listeners(): Listeners<SolidEngineListener> {
        return this._listeners;
    }

    public setConfig(config: Partial<SolidEngineConfig>): void {
        Object.assign(this.config, config);
    }

    public getFetch(): Fetch {
        return this.client.getFetch();
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        this.validateJsonLDGraph(document);

        if (id && (await this.client.documentExists(id))) {
            throw new DocumentAlreadyExists(id);
        }

        const properties = await this.getJsonLDGraphProperties(document);
        const { url, metadata } = await this.client.createDocument(
            collection,
            id,
            properties,
            usingExperimentalActivityPods()
                ? {
                    method: 'post',
                    format: 'application/ld+json',
                }
                : {},
        );

        await this._listeners.emit('onDocumentCreated', url, metadata);

        return url;
    }

    public async readOne(_: string, id: string): Promise<EngineDocument> {
        const rdfDocument = await this.getDocument(id);

        if (rdfDocument === null) {
            throw new DocumentNotFound(id);
        }

        const document = await this.convertToEngineDocument(rdfDocument);

        await this._listeners.emit('onRDFDocumentLoaded', rdfDocument.url as string, rdfDocument.metadata);
        await this._listeners.emit('onDocumentRead', rdfDocument.url as string, rdfDocument.metadata);

        return document;
    }

    public async readMany(collection: string, filters: EngineFilters = {}): Promise<EngineDocumentsCollection> {
        const documentsArray = await this.getDocumentsForFilters(collection, filters);
        const documents: EngineDocumentsCollection = {};

        await Promise.all(
            documentsArray.map(async (document) => {
                documents[document.url as string] = await this.convertToEngineDocument(document);

                await this._listeners.emit('onRDFDocumentLoaded', document.url as string, document.metadata);
                await this._listeners.emit('onDocumentRead', document.url as string, document.metadata);
            }),
        );

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        if ('$overwrite' in updates) {
            const properties = await this.getJsonLDGraphProperties(updates.$overwrite as JsonLD);
            const metadata = await this.client.overwriteDocument(id, properties);

            await this._listeners.emit('onDocumentUpdated', id, metadata);

            return;
        }

        const operations = await this.extractJsonLDGraphUpdate(updates);
        const metadata = await this.client.updateDocument(
            id,
            operations,
            usingExperimentalActivityPods() ? { format: 'application/ld+json' } : {},
        );

        if (metadata) {
            await this._listeners.emit('onDocumentUpdated', id, metadata);
        }
    }

    public async delete(collection: string, id: string): Promise<void> {
        const metadata = await this.client.deleteDocument(id);

        if (metadata) {
            await this._listeners.emit('onDocumentDeleted', id, metadata);
        }
    }

    /**
     * @deprecated Use .listeners instead.
     */
    public addListener(listener: SolidEngineListener): () => void {
        return this.listeners.add(listener);
    }

    /**
     * @deprecated Use .listeners instead.
     */
    public removeListener(listener: SolidEngineListener): void {
        this.listeners.remove(listener);
    }

    public clearCache(): void {
        this.cache = new Map();
    }

    private async getDocument(url: string): Promise<RDFDocument | null> {
        if (!this.config.cachesDocuments) {
            return this.client.getDocument(url);
        }

        if (!this.cache.has(url)) {
            const document = await this.client.getDocument(url);

            this.cache.set(url, document);
        }

        return this.cache.get(url)?.clone() ?? null;
    }

    private async getDocumentsForFilters(collection: string, filters: EngineFilters): Promise<RDFDocument[]> {
        const rdfsClasses = this.extractJsonLDGraphTypes(filters);

        return filters.$in
            ? await this.getDocumentsFromUrls(filters.$in.map(toString), rdfsClasses)
            : await this.client.getDocuments(collection, rdfsClasses.includes(LDP_CONTAINER));
    }

    private async getDocumentsFromUrls(urls: string[], rdfsClasses: string[]): Promise<RDFDocument[]> {
        const containerDocumentUrlsMap = urls.reduce(
            (map, documentUrl) => {
                const containerUrl = urlParentDirectory(documentUrl) ?? urlRoot(documentUrl);

                return {
                    ...map,
                    [containerUrl]: [...(map[containerUrl] || []), documentUrl],
                };
            },
            {} as Record<string, string[]>,
        );

        const containerDocumentPromises = Object.entries(containerDocumentUrlsMap).map(
            async ([containerUrl, documentUrls]) => {
                if (
                    this.config.useGlobbing &&
                    this.config.globbingBatchSize !== null &&
                    this.config.globbingBatchSize <= documentUrls.length
                )
                    return this.client.getDocuments(containerUrl, rdfsClasses.includes(LDP_CONTAINER));

                const documentPromises = documentUrls.map((url) => this.getDocument(url));
                const documents = await Promise.all(documentPromises);

                return documents.filter((document) => document != null) as RDFDocument[];
            },
        );

        const containerDocuments = await Promise.all(containerDocumentPromises);

        return containerDocuments.flat();
    }

    private async convertToEngineDocument(document: RDFDocument): Promise<EngineDocument> {
        const jsonld = await quadsToJsonLD(document.statements);
        const compactedJsonLD = await compactJsonLDGraph(jsonld);

        return compactedJsonLD as EngineDocument;
    }

    private validateJsonLDGraph(document: EngineDocument): void {
        if (!Array.isArray(document['@graph']))
            throw new SoukaiError(
                'Invalid JSON-LD graph provided for SolidEngine. ' + 'Are you using a model that isn\'t a SolidModel?',
            );
    }

    private async extractJsonLDGraphUpdate(updates: EngineUpdates): Promise<UpdateOperation[]> {
        if (!this.isJsonLDGraphUpdate(updates))
            throw new SoukaiError(
                'Invalid JSON-LD graph updates provided for SolidEngine. ' +
                    'Are you using a model that isn\'t a SolidModel?',
            );

        const changedUrls = new Map<string, string>();
        const updateOperations: UpdateOperation[] = [];
        const graphUpdates = '$apply' in updates['@graph'] ? updates['@graph'].$apply : [updates['@graph']];

        for (const graphUpdate of graphUpdates) {
            if (graphUpdate.$updateItems) {
                const updatesOperations = [];

                for (const update of arrayFrom(graphUpdate.$updateItems)) {
                    const operations = await this.extractJsonLDGraphItemsUpdate(update, changedUrls);

                    updatesOperations.push(...operations);
                }

                updateOperations.push(...updatesOperations.flat());
            }

            if (graphUpdate.$push) {
                const operations = await this.extractJsonLDGraphItemPush(graphUpdate.$push);

                updateOperations.push(...operations);
            }
        }

        return updateOperations;
    }

    private async extractJsonLDGraphItemsUpdate(
        { $where, $update, $override, $unset }: EngineUpdateItemsOperatorData,
        changedUrls: Map<string, string>,
    ): Promise<UpdateOperation[]> {
        // TODO use RDF libraries instead of implementing this conversion
        if (!$where || !('@id' in $where)) {
            throw new SoukaiError(
                'Invalid JSON-LD graph updates provided for SolidEngine. ' +
                    'Are you using a model that isn\'t a SolidModel?',
            );
        }

        if ($unset) {
            const filters = $where['@id'] as EngineRootFilter;
            const ids = typeof filters === 'string' ? [filters] : (filters.$in as string[]);

            return ids.map((url) => new RemovePropertyOperation(url));
        }

        if ($override) {
            const filters = $where['@id'] as EngineRootFilter;
            const ids = typeof filters === 'string' ? [filters] : (filters.$in as string[]);
            const updatesOperations = await Promise.all(
                ids.map(async (url) => {
                    const resourceUrl = changedUrls.get(url) ?? url;
                    const operations: UpdateOperation[] = [new RemovePropertyOperation(resourceUrl)];
                    const properties = await this.getJsonLDGraphProperties($override);

                    for (const property of properties) {
                        operations.push(new UpdatePropertyOperation(property));
                    }

                    return operations;
                }),
            );

            return updatesOperations.flat();
        }

        if (typeof $where['@id'] !== 'string') {
            throw new SoukaiError(
                'Invalid JSON-LD graph updates provided for SolidEngine. ' +
                    'Are you using a model that isn\'t a SolidModel?',
            );
        }

        const resourceUrl = changedUrls.get($where['@id']) ?? $where['@id'];
        const updates = $update;
        const operations: UpdateOperation[] = [];

        for (const [attribute, value] of Object.entries(updates as Record<string, EngineAttributeLeafValue>)) {
            if (value === null) {
                throw new SoukaiError('SolidEngine doesn\'t support setting properties to null, delete');
            }

            if (typeof value === 'object' && '$unset' in value) {
                operations.push(new RemovePropertyOperation(resourceUrl, attribute));
                continue;
            }

            if (attribute === '@id' && resourceUrl !== value) {
                operations.push(new ChangeUrlOperation(resourceUrl, value as string));
                changedUrls.set(value as string, resourceUrl);

                continue;
            }

            operations.push(
                new UpdatePropertyOperation(this.getUpdatePropertyOperationProperty(resourceUrl, attribute, value)),
            );
        }

        return operations;
    }

    /* eslint-disable max-len */
    private getUpdatePropertyOperationProperty(
        resourceUrl: string,
        attribute: string,
        value: unknown
    ): RDFResourceProperty | RDFResourceProperty[];

    private getUpdatePropertyOperationProperty(
        resourceUrl: string,
        attribute: string,
        value: unknown,
        allowArrays: true
    ): RDFResourceProperty | RDFResourceProperty[];

    private getUpdatePropertyOperationProperty(
        resourceUrl: string,
        attribute: string,
        value: unknown,
        allowArrays: false
    ): RDFResourceProperty;
    /* eslint-enable max-len */

    private getUpdatePropertyOperationProperty(
        resourceUrl: string,
        attribute: string,
        value: unknown,
        allowArrays: boolean = true,
    ): RDFResourceProperty | RDFResourceProperty[] {
        if (attribute === '@type') return RDFResourceProperty.type(resourceUrl, value as string);

        if (Array.isArray(value))
            return allowArrays
                ? value.map((v) => this.getUpdatePropertyOperationProperty(resourceUrl, attribute, v, false))
                : fail('Cannot have nested array values');

        if (isObject(value) && '@id' in value)
            return RDFResourceProperty.reference(resourceUrl, attribute, value['@id'] as string);

        if (isObject(value) && '@type' in value && value['@type'] === 'http://www.w3.org/2001/XMLSchema#dateTime')
            return RDFResourceProperty.literal(resourceUrl, attribute, new Date(value['@value'] as string));

        return RDFResourceProperty.literal(resourceUrl, attribute, value as LiteralValue);
    }

    private async extractJsonLDGraphItemPush(item: EngineDocument): Promise<UpdateOperation[]> {
        const itemProperties = await this.getJsonLDGraphProperties(item);

        return itemProperties.map((property) => new UpdatePropertyOperation(property));
    }

    private extractJsonLDGraphTypes(filters: EngineFilters): string[] {
        if (!this.isJsonLDGraphTypesFilter(filters)) return [];

        const typeFilters = filters['@graph'].$contains['@type'].$or;
        const types = typeFilters.reduce((_types, typeFilter) => {
            if ('$contains' in typeFilter) _types.push(...typeFilter.$contains);

            if ('$eq' in typeFilter) _types.push(typeFilter.$eq);

            return _types;
        }, [] as string[]);

        return arrayUnique(types.filter((type) => type.startsWith('http')));
    }

    private async getJsonLDGraphProperties(jsonld: JsonLD): Promise<RDFResourceProperty[]> {
        const document = await RDFDocument.fromJsonLD(jsonld);

        return document.properties;
    }

    private isJsonLDGraphUpdate(updates: Record<string, unknown>): updates is {
        '@graph':
            | {
                  $updateItems?: EngineUpdateItemsOperatorData;
                  $push?: EngineDocument;
              }
            | {
                  $apply: {
                      $updateItems?: EngineUpdateItemsOperatorData;
                      $push?: EngineDocument;
                  }[];
              };
    } {
        const graphUpdate = updates['@graph'];

        if (!isObject(graphUpdate)) return false;

        const operations = (graphUpdate.$apply ?? [graphUpdate]) as Record<string, unknown>[];

        return !operations.some((update) => {
            const keys = Object.keys(update);

            return keys.length !== 1 || !['$updateItems', '$push'].includes(keys[0] ?? '');
        });
    }

    private isJsonLDGraphTypesFilter(filters: Record<string, unknown>): filters is {
        '@graph': {
            $contains: {
                '@type': {
                    $or: ({ $contains: string[] } | { $eq: string })[];
                };
            };
        };
    } {
        const graphFilter = filters['@graph'];

        return (
            isObject(graphFilter) &&
            isObject(graphFilter.$contains) &&
            isObject(graphFilter.$contains['@type']) &&
            Array.isArray(graphFilter.$contains['@type'].$or)
        );
    }

}
