import type { Quad_Object } from '@rdfjs/types';
import { CRDT_SOFT_DELETE_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './SoftDeleteOperation.schema';

export default class SoftDeleteOperation extends Model {
    protected getDeletedAt(): Date | null {
        return this.date;
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_SOFT_DELETE_OPERATION_OBJECT];
    }
}
