import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import { RDFNamedNode } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Predicate } from '@rdfjs/types';
import { CRDT_PROPERTY, CRDT_PROPERTY_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { getRDFIriVariants, getRDFNamedNodeVariants } from 'soukai-bis/lib/rdf-prefix-aliases';
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

    protected filterQuads(quads: Quad[]): Quad[] {
        const variants = getRDFIriVariants(this.predicate.value);

        return quads.filter((q) => !this.subject.equals(q.subject) || !variants.includes(q.predicate.value));
    }

    protected deleteFromSparql(sparql: SparqlUpdate): void {
        const predicates =
            this.predicate.termType === 'NamedNode' ? getRDFNamedNodeVariants(this.predicate) : [this.predicate];

        for (const predicate of predicates) {
            sparql.delete(this.subject, predicate);
        }
    }
}
