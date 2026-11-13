import { defineSchema } from 'soukai-bis/models/schema';

import LifecycleOperation from './LifecycleOperation';
import { OPERATION_FIELDS } from './Operation.schema';

export default defineSchema(LifecycleOperation, {
    rdfClass: 'SoftDeleteOperation',
    fields: OPERATION_FIELDS,
});
