import { defineSchema } from 'soukai-bis/models/schema';

import PropertyOperation from './PropertyOperation';
import { PROPERTY_OPERATION_FIELDS } from './PropertyOperation.schema';

export default defineSchema(PropertyOperation, {
    rdfClass: 'UnsetPropertyOperation',
    fields: PROPERTY_OPERATION_FIELDS,
});
