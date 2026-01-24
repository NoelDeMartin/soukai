import type { JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import {
    LDP_BASIC_CONTAINER,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS,
    LDP_CONTAINS_PREDICATE,
} from 'soukai-bis/utils/rdf';
import type Operation from 'soukai-bis/models/crdts/Operation';

export default abstract class Engine {

    public abstract createDocument(url: string, graph: JsonLD): Promise<void>;
    public abstract readDocument(url: string): Promise<SolidDocument>;
    public abstract updateDocument(url: string, operations: Operation[]): Promise<void>;
    public abstract deleteDocument(url: string): Promise<void>;

    protected filterContainerQuads(quads: Quad[], options: { keepTypes?: boolean } = {}): Quad[] {
        return quads.filter(
            (quad) =>
                !quad.object.equals(LDP_CONTAINER_OBJECT) &&
                !quad.object.equals(LDP_BASIC_CONTAINER_OBJECT) &&
                (options.keepTypes || !quad.predicate.equals(LDP_CONTAINS_PREDICATE)),
        );
    }

    protected filterContainerOperations(operations: Operation[]): Operation[] {
        return operations.filter(
            (operation) => !(operation instanceof PropertyOperation) || !operation.hasPredicate(LDP_CONTAINS_PREDICATE),
        );
    }

    protected removeContainerProperties(graph: JsonLD, options: { keepTypes?: boolean } = {}): void {
        delete graph[LDP_CONTAINS];

        if (!options.keepTypes) {
            const types = graph['@type'] ? (Array.isArray(graph['@type']) ? graph['@type'] : [graph['@type']]) : [];

            graph['@type'] = types.filter((type) => type !== LDP_CONTAINER && type !== LDP_BASIC_CONTAINER);
        }
    }

}
