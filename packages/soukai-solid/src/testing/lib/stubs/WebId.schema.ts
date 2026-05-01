import { FieldType } from 'soukai';
import { defineSolidModelSchema } from 'soukai-solid/models';

export default defineSolidModelSchema({
    rdfsClass: null,
    fields: {
        name: {
            type: FieldType.String,
            rdfProperty: 'foaf:name',
        },
        knows: {
            type: FieldType.Array,
            items: FieldType.Key,
            rdfProperty: 'foaf:knows',
        },
        seeAlso: {
            type: FieldType.Array,
            items: FieldType.Key,
            rdfProperty: 'rdfs:seeAlso',
        },
        isPrimaryTopicOf: {
            type: FieldType.Array,
            items: FieldType.Key,
            rdfProperty: 'foaf:isPrimaryTopicOf',
        },
    },
});