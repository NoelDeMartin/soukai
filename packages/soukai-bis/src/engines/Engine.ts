import { RDFNamedNode, isJsonLDGraph } from '@noeldemartin/solid-utils';
import type { JsonLD, JsonLDGraph, SolidDocument, SolidResponse } from '@noeldemartin/solid-utils';
import { arrayChunk, isInstanceOf } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    CRDT_DELETED_AT,
    LDP_BASIC_CONTAINER,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS,
    LDP_CONTAINS_PREDICATE,
} from 'soukai-bis/lib/internals/rdf';
import { isLifecycleOperation, supersedesOperation } from 'soukai-bis/models/crdts/helpers';
import type Operation from 'soukai-bis/models/crdts/Operation';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import UnsetPropertyOperation from 'soukai-bis/models/crdts/UnsetPropertyOperation';

import type EngineOperation from './operations/EngineOperation';

export interface EngineMetadata {
    lastModifiedAt?: Nullable<Date>;
}

export default abstract class Engine {
    public static readonly engineName: string = 'Engine';

    public static(): typeof Engine {
        return this.constructor as typeof Engine;
    }

    public abstract createDocument(
        url: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        metadata?: EngineMetadata,
    ): Promise<SolidDocument>;

    public async createDocumentInContainer(
        containerUrl: string,
        proposedUrl: string,
        contents: JsonLD | JsonLDGraph | Quad[],
    ): Promise<SolidDocument> {
        this.assertContainerDocumentSlug(containerUrl, proposedUrl);

        return this.createDocument(proposedUrl, contents);
    }

    public abstract readDocument(url: string): Promise<SolidDocument>;

    public abstract updateDocument(
        url: string,
        operations: EngineOperation[],
        metadata?: EngineMetadata,
    ): Promise<SolidResponse | null>;

    public abstract deleteDocument(url: string): Promise<SolidResponse>;

    public async readDocumentIfExists(url: string): Promise<SolidDocument | null> {
        try {
            const document = await this.readDocument(url);

            return document;
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
                throw error;
            }

            return null;
        }
    }

    public async readDocuments(
        options: { urls: string[] } | { containerUrl: string; deep?: boolean; depth?: number },
    ): Promise<Record<string, SolidDocument>> {
        if ('urls' in options) {
            return this.readDocumentsByUrl(options.urls);
        }

        return this.readDocumentsByContainer(options.containerUrl, { deep: options.deep, depth: options.depth });
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

    protected async readDocumentsByUrl(urls: string[]): Promise<Record<string, SolidDocument>> {
        const documents: SolidDocument[] = [];

        for (const chunk of arrayChunk(urls, 10)) {
            const chunkDocuments = await Promise.all(chunk.map((url) => this.readDocumentIfExists(url)));

            documents.push(...chunkDocuments.filter((document): document is SolidDocument => !!document));
        }

        return Object.fromEntries(documents.map((document) => [document.url, document]));
    }

    protected async readDocumentsByContainer(
        containerUrl: string,
        options: { deep?: boolean; depth?: number } = {},
    ): Promise<Record<string, SolidDocument>> {
        const container = await this.readDocument(containerUrl);
        const containsQuads = container.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE);
        const documentUrls = containsQuads.map((quad) => quad.object.value);
        const documents = await this.readDocumentsByUrl(documentUrls);
        const results: Record<string, SolidDocument> = { [containerUrl]: container, ...documents };

        if (options.deep || (options.depth ?? 0) > 0) {
            for (const document of Object.values(documents)) {
                if (!document.url.endsWith('/')) {
                    continue;
                }

                const childResults = await this.readDocumentsByContainer(document.url, {
                    deep: options.deep,
                    depth: options.depth !== undefined ? options.depth - 1 : undefined,
                });

                Object.assign(results, childResults);
            }
        }

        return results;
    }

    protected filterContainerQuads(quads: Quad[], options: { keepTypes?: boolean } = {}): Quad[] {
        return quads.filter((quad) => {
            if (quad.predicate.equals(LDP_CONTAINS_PREDICATE)) {
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
        const getOverridableKey = (operation: EngineOperation): string | null => {
            if (isInstanceOf(operation, SetPropertyOperation) || isInstanceOf(operation, UnsetPropertyOperation)) {
                return `${operation.resourceUrl}-${operation.property}`;
            }

            if (isLifecycleOperation(operation)) {
                return `${operation.resourceUrl}-${CRDT_DELETED_AT}`;
            }

            return null;
        };
        const overridableOperations = operations.filter((operation) => getOverridableKey(operation) !== null);

        if (overridableOperations.length <= 1) {
            return operations;
        }

        const lastOperations = new Map<string, Operation>();

        for (const operation of overridableOperations as Operation[]) {
            const key = getOverridableKey(operation) as string;
            const existing = lastOperations.get(key);

            if (!existing || supersedesOperation(operation, existing)) {
                lastOperations.set(key, operation);
            }
        }

        return operations.filter((operation) => {
            const key = getOverridableKey(operation);

            return key === null || lastOperations.get(key) === operation;
        });
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
