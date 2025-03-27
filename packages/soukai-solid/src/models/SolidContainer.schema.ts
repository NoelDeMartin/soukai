import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export const solidContainerFields = {
    name: {
        type: FieldType.String,
        rdfProperty: 'rdfs:label',
    },
    description: {
        type: FieldType.String,
        rdfProperty: 'rdfs:comment',
    },
    resourceUrls: {
        type: FieldType.Array,
        rdfProperty: 'ldp:contains',
        items: FieldType.Key,
    },
    createdAt: {
        type: FieldType.Date,
        rdfProperty: 'purl:created',
    },
    updatedAt: {
        type: FieldType.Date,
        rdfProperty: 'purl:modified',
    },
} as const;

export default defineSolidModelSchema({
    rdfsClass: 'ldp:Container',
    timestamps: false,
    fields: solidContainerFields,
});
