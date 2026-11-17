import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { CRDT_ADD_PROPERTY_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './AddPropertyOperation.schema';

export default class AddPropertyOperation extends Model {
    public applyToQuads(quads: Quad[]): Quad[] {
        const valueQuads = this.getValueQuads().filter(
            (valueQuad) => !quads.some((quad) => this.matchesQuad(quad) && quad.object.equals(valueQuad.object)),
        );

        return quads.concat(valueQuads);
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.insert(this.getValueQuads());
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_ADD_PROPERTY_OPERATION_OBJECT];
    }
}
