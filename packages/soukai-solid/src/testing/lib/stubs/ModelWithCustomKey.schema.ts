import { FieldType } from 'soukai';
import { defineSolidModelSchema } from 'soukai-solid/models';

export default defineSolidModelSchema({
    rdfContexts: { foaf: 'http://xmlns.com/foaf/0.1/' },
    primaryKey: 'customKey' as const,
    fields: {
        age: {
            type: FieldType.Number,
            rdfProperty: 'foaf:age',
        },
    },
});