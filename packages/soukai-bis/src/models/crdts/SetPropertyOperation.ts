import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { CRDT_SET_PROPERTY_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './SetPropertyOperation.schema';

export default class SetPropertyOperation extends Model {
    public applyToQuads(quads: Quad[]): Quad[] {
        return this.filterQuads(quads).concat(this.getValueQuads());
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        this.deleteFromSparql(sparql);
        sparql.insert(this.getValueQuads());
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_SET_PROPERTY_OPERATION_OBJECT];
    }
}
