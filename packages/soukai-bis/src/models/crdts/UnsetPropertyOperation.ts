import type { Quad, Quad_Object } from '@rdfjs/types';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';

import { CRDT_UNSET_PROPERTY_OPERATION_OBJECT } from 'soukai-bis/utils/rdf';

import Model from './UnsetPropertyOperation.schema';

export default class UnsetPropertyOperation extends Model {

    public applyToQuads(quads: Quad[]): Quad[] {
        return this.filterQuads(quads);
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.delete(this.subject, this.predicate);
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_UNSET_PROPERTY_OPERATION_OBJECT];
    }

}
