import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfsClass: 'ldp:Resource',
    timestamps: false,
    fields: {
        types: {
            type: FieldType.Array,
            rdfProperty: 'rdf:type',
            items: FieldType.Key,
        },
        updatedAt: {
            type: FieldType.Date,
            rdfProperty: 'purl:modified',
        },
    },
});
