import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { foaf: 'http://xmlns.com/foaf/0.1/' },
    rdfsClass: 'Group',
    timestamps: false,
    fields: {
        name: {
            type: FieldType.String,
            required: true,
        },
        memberUrls: {
            type: FieldType.Array,
            rdfProperty: 'member',
            items: FieldType.Key,
        },
        creatorUrl: {
            type: FieldType.Key,
            rdfProperty: 'maker',
        },
    },
});
