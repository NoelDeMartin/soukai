import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Subject } from '@rdfjs/types';
import SoukaiError from 'soukai-bis/errors/SoukaiError';

import Model from './LifecycleOperation.schema';
import { setDeletedAtInQuads, setDeletedAtInSparql } from './soft-deletes';

export default class LifecycleOperation extends Model {
    private _metadataSubject: Quad_Subject | null = null;

    public setMetadataSubject(subject: Quad_Subject | null): this {
        this._metadataSubject = subject;

        return this;
    }

    public applyToQuads(quads: Quad[]): Quad[] {
        return setDeletedAtInQuads(quads, this.resourceUrl, this.getDeletedAt(), this._metadataSubject);
    }

    public applyToSparql(sparql: SparqlUpdate): void {
        setDeletedAtInSparql(sparql, this.getDeletedAt(), this._metadataSubject);
    }

    protected getDeletedAt(): Date | null {
        throw new SoukaiError(`getDeletedAt not implemented in ${this.static('modelName')}.`);
    }
}
