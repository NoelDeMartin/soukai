import { FieldType } from 'soukai';
import { defineSolidModelSchema } from 'soukai-solid/models';

export default defineSolidModelSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfsClass: null,
    timestamps: false,
    fields: {
        age: FieldType.Number,
    },
});