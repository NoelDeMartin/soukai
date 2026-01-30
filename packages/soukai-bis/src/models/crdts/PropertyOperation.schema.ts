import { url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';

import Operation from './Operation';
import { OPERATION_FIELDS } from './Operation.schema';

export const PROPERTY_OPERATION_FIELDS = {
    ...OPERATION_FIELDS,
    property: url().rdfProperty('property'),
} as const;

export default defineSchema(Operation, {
    rdfClass: 'PropertyOperation',
    fields: PROPERTY_OPERATION_FIELDS,
});
