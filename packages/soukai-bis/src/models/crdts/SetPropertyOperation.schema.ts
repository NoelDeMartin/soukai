import { any, array } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';

import PropertyOperation from './PropertyOperation';
import { PROPERTY_OPERATION_FIELDS } from './PropertyOperation.schema';

export const SET_PROPERTY_OPERATION_FIELDS = {
    ...PROPERTY_OPERATION_FIELDS,
    value: array(any()).rdfProperty('value'),
} as const;

export default defineSchema(PropertyOperation, {
    rdfClass: 'SetPropertyOperation',
    fields: SET_PROPERTY_OPERATION_FIELDS,
});
