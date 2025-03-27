import { defineSolidModelSchema } from 'soukai-solid/models/schema';
import { FieldType, TimestampField } from 'soukai';

export default defineSolidModelSchema({
    rdfContexts: {
        foaf: 'http://xmlns.com/foaf/0.1/',
        vcard: 'http://www.w3.org/2006/vcard/ns#',
    },
    rdfsClass: 'Person',
    timestamps: [TimestampField.CreatedAt],
    fields: {
        name: FieldType.String,
        lastName: FieldType.String,
        givenName: FieldType.String,
        nickName: {
            type: FieldType.String,
            rdfProperty: 'vcard:nickname',
        },
        age: FieldType.Number,
        directed: {
            type: FieldType.Key,
            rdfProperty: 'made',
        },
        starred: {
            type: FieldType.Array,
            rdfProperty: 'pastProject',
            items: FieldType.Key,
        },
        friendUrls: {
            type: FieldType.Array,
            rdfProperty: 'knows',
            items: FieldType.Key,
        },
    },
});
