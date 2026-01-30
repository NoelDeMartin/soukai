import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';

import {
    CRDT_SET_PROPERTY_OPERATION_OBJECT,
    CRDT_VALUE,
    CRDT_VALUE_PREDICATE,
    createRDFLiteral,
} from 'soukai-bis/utils/rdf';

import Model from './SetPropertyOperation.schema';
import type Operation from './Operation';

export default class SetPropertyOperation extends Model {

    private _isNamedNode: boolean = false;
    private _values: Quad_Object[] | null = null;

    public get values(): Quad_Object[] {
        this._values ??= this.value.map((value) =>
            this._isNamedNode ? new RDFNamedNode(value) : createRDFLiteral(value));

        return this._values;
    }

    public setValues(values: Quad_Object[]): this {
        this._values = values;

        return this;
    }

    public setNamedNode(isNamedNode: boolean): this {
        this._values = null;
        this._isNamedNode = isNamedNode;

        return this;
    }

    public applyToQuads(quads: Quad[]): Quad[] {
        return this.filterQuads(quads).concat(this.getValueQuads());
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        sparql.delete(this.subject, this.predicate);
        sparql.insert(this.getValueQuads());
    }

    public createDocumentOperations(): Operation[] {
        return [
            ...super.createDocumentOperations(),
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: CRDT_VALUE,
                value: this.value,
                date: this.date,
            })
                .setPredicate(CRDT_VALUE_PREDICATE)
                .setNamedNode(this._isNamedNode),
        ];
    }

    protected getValueQuads(): Quad[] {
        return this.values.map((value) => new RDFQuad(this.subject, this.predicate, value));
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_SET_PROPERTY_OPERATION_OBJECT];
    }

}
