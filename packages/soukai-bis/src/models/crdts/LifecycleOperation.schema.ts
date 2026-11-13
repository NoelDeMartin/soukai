import { defineSchema } from 'soukai-bis/models/schema';

import Operation from './Operation';
import { OPERATION_FIELDS } from './Operation.schema';

export default defineSchema(Operation, {
    rdfClass: 'LifecycleOperation',
    fields: OPERATION_FIELDS,
});
