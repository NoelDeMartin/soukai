import type { Quad, Quad_Predicate, Quad_Subject } from '@rdfjs/types';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';

import PropertyOperation from './PropertyOperation';

export default class UnsetPropertyOperation extends PropertyOperation {

    public constructor(resource: Quad_Subject, property: Quad_Predicate) {
        super(resource, property);
    }

    public applyToQuads(quads: Quad[]): Quad[] {
        return this.filterQuads(quads);
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.delete(this.resource, this.property);
    }

}
