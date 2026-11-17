import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import { RDFNamedNode } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Predicate } from '@rdfjs/types';
import { CRDT_PROPERTY, CRDT_PROPERTY_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { getRDFIRIVariants, getRDFNamedNodeVariants } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { requireBootedModel } from 'soukai-bis/models/registry';

import type Operation from './Operation';
import Model from './PropertyOperation.schema';

export default class PropertyOperation extends Model {
    private _predicate: Quad_Predicate | null = null;

    public get predicate(): Quad_Predicate {
        this._predicate ??= new RDFNamedNode(this.property);

        return this._predicate;
    }

    public setPredicate(predicate: Quad_Predicate): this {
        this._predicate = predicate;

        return this;
    }

    public hasPredicate(predicate: Quad_Predicate): boolean {
        return this.predicate.equals(predicate);
    }

    public createDocumentOperations(): Operation[] {
        const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

        return [
            ...super.createDocumentOperations(),
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: CRDT_PROPERTY,
                value: [this.property],
                date: this.date,
            })
                .setPredicate(CRDT_PROPERTY_PREDICATE)
                .setNamedNode(true),
        ];
    }

    protected getHashContent(): string[] {
        return [...super.getHashContent(), this.property];
    }

    protected matchesQuad(quad: Quad): boolean {
        return (
            this.subject.equals(quad.subject) && getRDFIRIVariants(this.predicate.value).includes(quad.predicate.value)
        );
    }

    protected getPredicateVariants(): Quad_Predicate[] {
        return this.predicate.termType === 'NamedNode' ? getRDFNamedNodeVariants(this.predicate) : [this.predicate];
    }

    protected filterQuads(quads: Quad[]): Quad[] {
        return quads.filter((quad) => !this.matchesQuad(quad));
    }

    protected deleteFromSparql(sparql: SparqlUpdate): void {
        for (const predicate of this.getPredicateVariants()) {
            sparql.delete(this.subject, predicate);
        }
    }
}
