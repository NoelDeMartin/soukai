import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export const operationFields = {
    resourceUrl: {
        type: FieldType.Key,
        required: true,
        rdfProperty: 'resource',
    },
    date: {
        type: FieldType.Date,
        required: true,
    },
} as const;

export default defineSolidModelSchema({
    rdfContexts: { crdt: 'https://vocab.noeldemartin.com/crdt/' },
    rdfsClass: 'Operation',
    timestamps: false,
    fields: operationFields,
});
