import type { Quad_Object } from '@rdfjs/types';
import { CRDT_RESTORE_OPERATION_OBJECT } from 'soukai-bis/lib/internals/rdf';

import Model from './RestoreOperation.schema';

export default class RestoreOperation extends Model {
    protected getDeletedAt(): Date | null {
        return null;
    }

    protected getTypeQuads(): Quad_Object[] {
        return [CRDT_RESTORE_OPERATION_OBJECT];
    }
}
