import { RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object, Quad_Predicate, Quad_Subject } from '@rdfjs/types';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';

import PropertyOperation from './PropertyOperation';

export default class SetPropertyOperation extends PropertyOperation {

    public constructor(
        resource: Quad_Subject,
        property: Quad_Predicate,
        protected value: Quad_Object | Quad_Object[],
    ) {
        super(resource, property);
    }

    public applyToQuads(quads: Quad[]): Quad[] {
        return this.filterQuads(quads).concat(this.getValueQuads());
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.delete(this.resource, this.property);
        sparql.insert(this.getValueQuads());
    }

    protected getValueQuads(): Quad[] {
        const values = Array.isArray(this.value) ? this.value : [this.value];

        return values.map((value) => new RDFQuad(this.resource, this.property, value));
    }

}
