import { arrayChunk, isInstanceOf } from '@noeldemartin/utils';
import { RDFNamedNode, isJsonLDGraph } from '@noeldemartin/solid-utils';
import type { JsonLD, JsonLDGraph, SolidDocument, SolidResponse } from '@noeldemartin/solid-utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';

import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import UnsetPropertyOperation from 'soukai-bis/models/crdts/UnsetPropertyOperation';
import {
    LDP_BASIC_CONTAINER,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS,
    LDP_CONTAINS_PREDICATE,
} from 'soukai-bis/utils/rdf';
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
        metadata?: EngineMetadata
    ): Promise<SolidDocument>;

    public abstract readDocument(url: string): Promise<SolidDocument>;

    public abstract updateDocument(
        url: string,
        operations: EngineOperation[],
        metadata?: EngineMetadata
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
        const overridableOperations = operations.filter(
            (operation): operation is SetPropertyOperation | UnsetPropertyOperation => {
                return isInstanceOf(operation, SetPropertyOperation) || isInstanceOf(operation, UnsetPropertyOperation);
            },
        );

        if (overridableOperations.length <= 1) {
            return operations;
        }

        const lastOperations = new Map<string, SetPropertyOperation | UnsetPropertyOperation>();

        for (const operation of overridableOperations) {
            const key = `${operation.resourceUrl}-${operation.property}`;
            const existing = lastOperations.get(key);

            if (!existing || operation.date.getTime() > existing.date.getTime()) {
                lastOperations.set(key, operation);
            }
        }

        return operations.filter((operation) => {
            if (!isInstanceOf(operation, SetPropertyOperation) && !isInstanceOf(operation, UnsetPropertyOperation)) {
                return true;
            }

            const key = `${operation.resourceUrl}-${operation.property}`;

            return lastOperations.get(key) === operation;
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
