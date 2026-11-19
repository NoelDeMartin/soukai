import type { Quad_Object } from '@rdfjs/types';
import { CRDT_DELETE_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './DeleteOperation.schema';

export default class DeleteOperation extends Model {
    protected getDeletedAt(): Date | null {
        return this.date;
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_DELETE_OPERATION_OBJECT];
    }
}
