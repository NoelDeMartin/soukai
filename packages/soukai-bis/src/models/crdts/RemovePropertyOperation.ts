import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { CRDT_REMOVE_PROPERTY_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './RemovePropertyOperation.schema';

export default class RemovePropertyOperation extends Model {
    public applyToQuads(quads: Quad[]): Quad[] {
        return quads.filter(
            (quad) => !this.matchesQuad(quad) || !this.values.some((value) => value.equals(quad.object)),
        );
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        for (const predicate of this.getPredicateVariants()) {
            for (const value of this.values) {
                sparql.delete(this.subject, predicate, value);
            }
        }
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_REMOVE_PROPERTY_OPERATION_OBJECT];
    }
}
