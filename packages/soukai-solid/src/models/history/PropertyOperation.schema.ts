import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

import Operation from './Operation';
import { operationFields } from './Operation.schema';

export const propertyOperationFields = {
    ...operationFields,
    property: {
        type: FieldType.Key,
        required: true,
    },
} as const;

export default defineSolidModelSchema(Operation, {
    rdfsClass: 'PropertyOperation',
    fields: propertyOperationFields,
});
