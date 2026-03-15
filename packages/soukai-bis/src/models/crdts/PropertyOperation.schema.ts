import { url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

import Operation from './Operation';
import { OPERATION_FIELDS } from './Operation.schema';

export const PROPERTY_OPERATION_FIELDS = {
    ...OPERATION_FIELDS,
    property: rdfProperty(url(), 'property'),
} as const;

export default defineSchema(Operation, {
    rdfClass: 'PropertyOperation',
    fields: PROPERTY_OPERATION_FIELDS,
});
