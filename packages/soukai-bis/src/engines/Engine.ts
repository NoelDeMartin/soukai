import { RDFNamedNode, isJsonLDGraph } from '@noeldemartin/solid-utils';
import type { JsonLD, JsonLDGraph, SolidDocument, SolidResponse } from '@noeldemartin/solid-utils';
import { arrayChunk, arrayFilter, isInstanceOf, required, tap } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    LDP_BASIC_CONTAINER,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS,
    LDP_CONTAINS_PREDICATE,
} from 'soukai-bis/lib/internals/rdf';
import {
    createPropertyResetOperation,
    foldPropertyOperations,
    getPropertyOperationKey,
    isArrayPropertyOperation,
    isLifecycleOperation,
    isPropertyResetOperation,
    sortedOperations,
    supersedesOperation,
    withEffectiveValues,
} from 'soukai-bis/models/crdts/helpers';
import type Operation from 'soukai-bis/models/crdts/Operation';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';

import type EngineOperation from './operations/EngineOperation';

export type FileWriteOptions<TWriteOptions extends object = never> = ([TWriteOptions] extends [never]
    ? {}
    : TWriteOptions) & {
    mimeType?: string;
};

export type ReadDocumentsOptions<TReadOptions extends object = object> = TReadOptions &
    ({ urls: string[] } | { containerUrl: string; deep?: boolean; depth?: number });

export type CreateDocumentInContainerOptions<TWriteOptions extends object = never> = {
    proposedUrl?: Nullable<string>;
} & ([TWriteOptions] extends [never] ? {} : TWriteOptions);

export default abstract class Engine<
    TReadOptions extends object = object,
    TWriteOptions extends object = never,
    TDeleteOptions extends object = never,
> {
    public static readonly engineName: string = 'Engine';

    public static(): typeof Engine {
        return this.constructor as typeof Engine;
    }

    public abstract createDocument(
        url: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        options?: TWriteOptions,
    ): Promise<SolidDocument>;

    public async createDocumentInContainer(
        containerUrl: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        options: CreateDocumentInContainerOptions<TWriteOptions> = {} as CreateDocumentInContainerOptions<TWriteOptions>,
    ): Promise<SolidDocument> {
        const { proposedUrl, ...writeOptions } = options;

        if (!proposedUrl) {
            throw new SoukaiError(
                `${this.static().engineName} can't create documents in containers without a proposed url`,
            );
        }

        this.assertContainerDocumentSlug(containerUrl, proposedUrl);

        return this.createDocument(proposedUrl, contents, writeOptions as TWriteOptions);
    }

    public abstract readDocument(url: string, options?: TReadOptions): Promise<SolidDocument>;

    public abstract updateDocument(
        url: string,
        operations: EngineOperation[],
        options?: TWriteOptions,
    ): Promise<SolidResponse | null>;

    public abstract deleteDocument(url: string, options?: TDeleteOptions): Promise<SolidResponse>;

    public abstract writeFile(
        url: string,
        blob: Blob,
        options?: FileWriteOptions<TWriteOptions>,
    ): Promise<SolidResponse | null>;

    public abstract createFile(
        url: string,
        blob: Blob,
        options?: FileWriteOptions<TWriteOptions>,
    ): Promise<SolidResponse | null>;

    public abstract readFile(url: string, options?: TReadOptions): Promise<Blob>;

    public abstract deleteFile(url: string, options?: TWriteOptions): Promise<SolidResponse | null>;

    public async readFileIfExists(url: string, options?: TReadOptions): Promise<Blob | null> {
        try {
            return await this.readFile(url, options);
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
                throw error;
            }

            return null;
        }
    }

    public async readDocumentIfExists(url: string, options?: TReadOptions): Promise<SolidDocument | null> {
        try {
            const document = await this.readDocument(url, options);

            return document;
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
                throw error;
            }

            return null;
        }
    }

    public async readDocuments(options: ReadDocumentsOptions<TReadOptions>): Promise<Record<string, SolidDocument>> {
        if ('urls' in options) {
            const { urls, ...readOptions } = options;

            return this.readDocumentsByUrl(urls, readOptions as TReadOptions);
        }

        const { containerUrl, deep, depth, ...readOptions } = options;

        return this.readDocumentsByContainer(containerUrl, { deep, depth }, readOptions as TReadOptions);
    }

    protected assertContainerDocumentSlug(containerUrl: string, documentUrl: string): string {
        if (documentUrl.endsWith('/')) {
            throw new SoukaiError(`Posting containers is not supported (proposed url ${documentUrl})`);
        }

        const slug = documentUrl.slice(containerUrl.length);

        if (!containerUrl.endsWith('/') || !documentUrl.startsWith(containerUrl) || !slug || slug.includes('/')) {
            throw new SoukaiError(`Proposed url ${documentUrl} is not a document in container ${containerUrl}`);
        }

        return slug;
    }

    protected assertFileUrl(url: string): void {
        if (url.endsWith('/')) {
            throw new SoukaiError(`Containers can't be used as files (url ${url})`);
        }
    }

    protected async readDocumentsByUrl(urls: string[], options?: TReadOptions): Promise<Record<string, SolidDocument>> {
        const documents: SolidDocument[] = [];

        for (const chunk of arrayChunk(urls, 10)) {
            const chunkDocuments = await Promise.all(chunk.map((url) => this.readDocumentIfExists(url, options)));

            documents.push(...chunkDocuments.filter((document): document is SolidDocument => !!document));
        }

        return Object.fromEntries(documents.map((document) => [document.url, document]));
    }

    protected async readDocumentsByContainer(
        containerUrl: string,
        { deep, depth }: { deep?: boolean; depth?: number } = {},
        readOptions?: TReadOptions,
    ): Promise<Record<string, SolidDocument>> {
        const container = await this.readDocument(containerUrl, readOptions);
        const containsQuads = container.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE);
        const documentUrls = containsQuads.map((quad) => quad.object.value);
        const documents = await this.readDocumentsByUrl(documentUrls, readOptions);
        const results: Record<string, SolidDocument> = { [containerUrl]: container, ...documents };

        if (deep || (depth ?? 0) > 0) {
            for (const document of Object.values(documents)) {
                if (!document.url.endsWith('/')) {
                    continue;
                }

                const childResults = await this.readDocumentsByContainer(
                    document.url,
                    { deep, depth: depth !== undefined ? depth - 1 : undefined },
                    readOptions,
                );

                Object.assign(results, childResults);
            }
        }

        return results;
    }

    protected filterContainerQuads(quads: Quad[], options: { keepTypes?: boolean } = {}): Quad[] {
        const childrenUrls = new Set(
            quads.filter((quad) => quad.predicate.equals(LDP_CONTAINS_PREDICATE)).map((quad) => quad.object.value),
        );

        return quads.filter((quad) => {
            if (quad.predicate.equals(LDP_CONTAINS_PREDICATE) || childrenUrls.has(quad.subject.value)) {
                return false;
            }

            if (quad.object.equals(LDP_CONTAINER_OBJECT) || quad.object.equals(LDP_BASIC_CONTAINER_OBJECT)) {
                return !!options.keepTypes;
            }

            return true;
        });
    }

    protected filterContainerOperations(operations: EngineOperation[]): EngineOperation[] {
        return operations.filter(
            (operation) => !(operation instanceof PropertyOperation) || !operation.hasPredicate(LDP_CONTAINS_PREDICATE),
        );
    }

    protected filterSupersededOperations(operations: EngineOperation[]): EngineOperation[] {
        const lifecycleOperations = operations.filter(isLifecycleOperation);
        const propertyOperations = operations.filter((operation) => isInstanceOf(operation, PropertyOperation));

        if (lifecycleOperations.length + propertyOperations.length <= 1) {
            return operations;
        }

        const replacements = new Map<EngineOperation, EngineOperation | null>();
        const lastLifecycleOperations = new Map<string, Operation>();
        const propertyOperationGroups = new Map<string, PropertyOperation[]>();

        for (const operation of lifecycleOperations) {
            const existing = lastLifecycleOperations.get(operation.resourceUrl);

            if (!existing || supersedesOperation(operation, existing)) {
                lastLifecycleOperations.set(operation.resourceUrl, operation);
            }
        }

        for (const operation of lifecycleOperations) {
            lastLifecycleOperations.get(operation.resourceUrl) === operation || replacements.set(operation, null);
        }

        for (const operation of propertyOperations) {
            const key = getPropertyOperationKey(operation);
            const group = propertyOperationGroups.get(key) ?? tap([], (ops) => propertyOperationGroups.set(key, ops));

            group.push(operation);
        }

        for (const group of propertyOperationGroups.values()) {
            this.filterSupersededPropertyOperations(group, replacements);
        }

        return arrayFilter(
            operations.map((operation) => (replacements.has(operation) ? replacements.get(operation) : operation)),
        );
    }

    protected filterSupersededPropertyOperations(
        operations: PropertyOperation[],
        replacements: Map<EngineOperation, EngineOperation | null>,
    ): void {
        if (operations.length <= 1) {
            return;
        }

        const lastReset = sortedOperations(operations.filter(isPropertyResetOperation)).at(-1);
        const arrayOperations = operations.filter(isArrayPropertyOperation);
        const effectiveArrayOperations = arrayFilter(
            arrayOperations.map((operation) =>
                tap(withEffectiveValues(operation, operations), (effectiveOperation) =>
                    replacements.set(operation, effectiveOperation),
                ),
            ),
        );

        for (const operation of operations) {
            isPropertyResetOperation(operation) && operation !== lastReset && replacements.set(operation, null);
        }

        if (!lastReset || effectiveArrayOperations.length === 0) {
            return;
        }

        this.replaceWithSingleResetOperation(lastReset, effectiveArrayOperations, replacements);
    }

    protected replaceWithSingleResetOperation(
        resetOperation: PropertyOperation,
        laterArrayOperations: PropertyOperation[],
        replacements: Map<EngineOperation, EngineOperation | null>,
    ): void {
        const lastOperation = required(sortedOperations(laterArrayOperations).at(-1));
        const values = foldPropertyOperations([resetOperation, ...laterArrayOperations]);

        replacements.set(resetOperation, createPropertyResetOperation(resetOperation, values, lastOperation.date));

        for (const arrayOperation of laterArrayOperations) {
            replacements.set(arrayOperation, null);
        }
    }

    protected removeContainerProperties(graph: JsonLD | JsonLDGraph, options: { keepTypes?: boolean } = {}): void {
        if (isJsonLDGraph(graph)) {
            for (const resource of graph['@graph']) {
                this.removeContainerProperties(resource, options);
            }

            return;
        }

        delete graph[LDP_CONTAINS];

        if (!options.keepTypes) {
            const types = graph['@type'] ? (Array.isArray(graph['@type']) ? graph['@type'] : [graph['@type']]) : [];

            graph['@type'] = types.filter((type) => type !== LDP_CONTAINER && type !== LDP_BASIC_CONTAINER);
        }
    }
}
