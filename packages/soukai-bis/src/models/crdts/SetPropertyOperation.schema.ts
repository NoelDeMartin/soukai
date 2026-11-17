import { defineSchema } from 'soukai-bis/models/schema';

import ValuePropertyOperation from './ValuePropertyOperation';
import { VALUE_PROPERTY_OPERATION_FIELDS } from './ValuePropertyOperation.schema';

export default defineSchema(ValuePropertyOperation, {
    rdfClass: 'SetPropertyOperation',
    fields: VALUE_PROPERTY_OPERATION_FIELDS,
});
