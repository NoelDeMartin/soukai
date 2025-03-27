import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContexts: { schema: 'https://schema.org/' },
    rdfsClass: 'Movie',
    timestamps: false,
    fields: {
        title: {
            rdfProperty: 'name',
            type: FieldType.String,
        },
        imageUrls: {
            type: FieldType.Array,
            items: FieldType.Key,
            rdfProperty: 'image',
        },
        externalUrls: {
            type: FieldType.Array,
            rdfProperty: 'sameAs',
            items: FieldType.Key,
        },
        releaseDate: {
            type: FieldType.Date,
            rdfProperty: 'datePublished',
        },
        rating: {
            type: FieldType.String,
            rdfProperty: 'contentRating',
        },
    },
});
