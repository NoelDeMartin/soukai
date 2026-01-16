import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Subject } from '@rdfjs/types';

export default abstract class Operation {

    public constructor(protected resource: Quad_Subject) {}

    public abstract applyToQuads(quads: Quad[]): Quad[];

    public abstract applyToSparql(sparql: SparqlUpdate): void;

}
