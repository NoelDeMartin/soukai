import { any, array } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

import PropertyOperation from './PropertyOperation';
import { PROPERTY_OPERATION_FIELDS } from './PropertyOperation.schema';

export const SET_PROPERTY_OPERATION_FIELDS = {
    ...PROPERTY_OPERATION_FIELDS,
    value: rdfProperty(array(any()), 'value'),
} as const;

export default defineSchema(PropertyOperation, {
    rdfClass: 'SetPropertyOperation',
    fields: SET_PROPERTY_OPERATION_FIELDS,
});
