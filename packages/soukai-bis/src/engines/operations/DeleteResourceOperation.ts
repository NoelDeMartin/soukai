import { RDFNamedNode, type SparqlUpdate } from '@noeldemartin/solid-utils';
import type { NamedNode, Quad, Quad_Subject } from '@rdfjs/types';

import type EngineOperation from './EngineOperation';

export default class DeleteResourceOperation implements EngineOperation {

    private resource: Quad_Subject;

    public constructor(resourceUrl: NamedNode | string) {
        this.resource = typeof resourceUrl === 'string' ? new RDFNamedNode(resourceUrl) : resourceUrl;
    }

    public applyToQuads(quads: Quad[]): Quad[] {
        return quads.filter((quad) => !quad.subject.equals(this.resource));
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.delete(this.resource);
    }

}
