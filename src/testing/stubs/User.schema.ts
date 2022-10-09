import { FieldType, Model } from '@/models/index';

export default Model.schema({
    name: {
        type: FieldType.String,
        required: true,
    },
    avatarUrl: FieldType.Key,
    surname: FieldType.String,
    age: FieldType.Number,
    birthDate: FieldType.Date,
    contact: {
        email: FieldType.String,
        phone: FieldType.String,
    },
    social: {
        type: FieldType.Object,
        fields: {
            website: FieldType.String,
            mastodon: FieldType.String,
        },
    },
    externalUrls: {
        type: FieldType.Array,
        items: FieldType.Key,
    },
});
