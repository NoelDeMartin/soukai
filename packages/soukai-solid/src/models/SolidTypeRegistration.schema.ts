import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { solid: 'http://www.w3.org/ns/solid/terms#' },
    rdfsClass: 'TypeRegistration',
    timestamps: false,
    fields: {
        forClass: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
        instance: FieldType.Key,
        instanceContainer: FieldType.Key,
    },
});
