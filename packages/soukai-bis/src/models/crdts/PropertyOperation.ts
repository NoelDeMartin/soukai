import { RDFNamedNode } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Predicate } from '@rdfjs/types';

import { CRDT_PROPERTY, CRDT_PROPERTY_PREDICATE } from 'soukai-bis/utils/rdf';
import { requireBootedModel } from 'soukai-bis/models/registry';

import Model from './PropertyOperation.schema';
import type Operation from './Operation';

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

    protected filterQuads(quads: Quad[]): Quad[] {
        return quads.filter((q) => !this.subject.equals(q.subject) || !this.predicate.equals(q.predicate));
    }

}
