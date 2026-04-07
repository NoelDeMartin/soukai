import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

export default interface EngineOperation {
    applyToQuads(quads: Quad[]): Quad[];
    applyToSparql(sparql: SparqlUpdate): void;
}
