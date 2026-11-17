import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { CRDT_VALUE, CRDT_VALUE_PREDICATE, createRDFLiteral, serializeTerm } from 'soukai-bis/lib/internals/rdf';
import { requireBootedModel } from 'soukai-bis/models/registry';

import type Operation from './Operation';
import Model from './ValuePropertyOperation.schema';

export default class ValuePropertyOperation extends Model {
    private _values: Quad_Object[] | null = null;
    declare private isNamedNode: boolean;

    protected initialize(...[attributes, options]: ConstructorParameters<typeof Model>): void {
        super.initialize(attributes, options);

        const valueQuad = options?.source?.find(
            (quad) => quad.subject.value === attributes?.url && quad.predicate.equals(CRDT_VALUE_PREDICATE),
        );

        this.isNamedNode = valueQuad?.object.termType === 'NamedNode';
    }

    public get values(): Quad_Object[] {
        this._values ??= this.value.map((value) =>
            this.isNamedNode ? new RDFNamedNode(value) : createRDFLiteral(value),
        );

        return this._values;
    }

    public setValues(values: Quad_Object[]): this {
        this._values = values;

        return this;
    }

    public setNamedNode(isNamedNode: boolean): this {
        this._values = null;
        this.isNamedNode = isNamedNode;

        return this;
    }

    public createDocumentOperations(): Operation[] {
        const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

        return [
            ...super.createDocumentOperations(),
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: CRDT_VALUE,
                value: this.value,
                date: this.date,
            })
                .setPredicate(CRDT_VALUE_PREDICATE)
                .setNamedNode(this.isNamedNode)
                .setValues(this.values),
        ];
    }

    protected getHashContent(): string[] {
        return [...super.getHashContent(), ...this.values.map((value) => serializeTerm(value)).sort()];
    }

    protected getValueQuads(): Quad[] {
        return this.values.map((value) => new RDFQuad(this.subject, this.predicate, value));
    }
}
