import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { crdt: 'https://vocab.noeldemartin.com/crdt/' },
    rdfsClass: 'Metadata',
    timestamps: false,
    fields: {
        resourceUrl: {
            type: FieldType.Key,
            required: true,
            rdfProperty: 'resource',
        },
        createdAt: FieldType.Date,
        updatedAt: FieldType.Date,
        deletedAt: FieldType.Date,
    },
});
