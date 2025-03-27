import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfsClass: 'ldp:Resource',
    timestamps: false,
    fields: {
        updatedAt: {
            type: FieldType.Date,
            rdfProperty: 'purl:modified',
        },
    },
});
