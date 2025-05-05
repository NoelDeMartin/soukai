import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContext: 'https://schema.org/',
    rdfsClass: 'TVSeries',
    timestamps: false,
    fields: {
        name: FieldType.String,
    },
});
