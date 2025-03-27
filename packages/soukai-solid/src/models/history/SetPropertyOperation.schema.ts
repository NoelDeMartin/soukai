import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

import PropertyOperation from './PropertyOperation';
import { propertyOperationFields } from './PropertyOperation.schema';

export default defineSolidModelSchema(PropertyOperation, {
    rdfsClass: 'SetPropertyOperation',
    fields: {
        ...propertyOperationFields,
        value: {
            type: FieldType.Any,
            required: true,
        },
    },
});
