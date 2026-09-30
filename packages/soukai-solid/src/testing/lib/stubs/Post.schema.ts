import { FieldType } from 'soukai';
import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContext: 'https://schema.org/',
    rdfsClass: 'Article',
    fields: {
        title: {
            type: FieldType.String,
            rdfProperty: 'name',
        },
        authorUrl: {
            type: FieldType.Key,
            rdfProperty: 'author',
        },
    },
});
