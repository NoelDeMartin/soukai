import { RDFNamedNode } from '@noeldemartin/solid-utils';
import { uuid } from '@noeldemartin/utils';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object, Quad_Subject } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { MintUrlOptions } from 'soukai-bis/models/Model';

import Model from './Operation.schema';
import {
    CRDT_DATE,
    CRDT_DATE_PREDICATE,
    CRDT_RESOURCE,
    CRDT_RESOURCE_PREDICATE,
    RDF_TYPE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';

export default class Operation extends Model {

    private _subject: Quad_Subject | null = null;

    public get subject(): Quad_Subject {
        this._subject ??= new RDFNamedNode(this.resourceUrl);

        return this._subject;
    }

    public setSubject(subject: Quad_Subject): this {
        this._subject = subject;

        return this;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public applyToQuads(quads: Quad[]): Quad[] {
        throw new SoukaiError(`applyToQuads not implemented in ${this.static('modelName')}.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public applyToSparql(sparql: SparqlUpdate): void {
        throw new SoukaiError(`applyToSparql not implemented in ${this.static('modelName')}.`);
    }

    public createDocumentOperations(): Operation[] {
        const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

        return [
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: RDF_TYPE,
                value: [this],
                date: this.date,
            })
                .setNamedNode(true)
                .setPredicate(RDF_TYPE_PREDICATE)
                .setValues(this.getTypeQuads()),
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: CRDT_RESOURCE,
                value: [this.resourceUrl],
                date: this.date,
            })
                .setNamedNode(true)
                .setPredicate(CRDT_RESOURCE_PREDICATE),
            new SetPropertyOperation({
                resourceUrl: this.requireUrl(),
                property: CRDT_DATE,
                value: [this.date],
                date: this.date,
            }).setPredicate(CRDT_DATE_PREDICATE),
        ];
    }

    protected newUrl(options: MintUrlOptions = {}): string {
        if (!this.resourceUrl) {
            return super.newUrl(options);
        }

        const hashSuffix = options.resourceHash ?? uuid();

        return this.resourceUrl.includes('#')
            ? `${this.resourceUrl}-operation-${hashSuffix}`
            : `${this.resourceUrl}#operation-${hashSuffix}`;
    }

    protected getTypeQuads(): Quad_Object[] {
        return [];
    }

}
