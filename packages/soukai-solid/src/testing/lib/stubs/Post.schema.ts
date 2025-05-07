import { defineSolidModelSchema } from 'soukai-solid/models/schema';
import { FieldType } from 'soukai';

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
