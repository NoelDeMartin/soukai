import { Model, FieldType } from '@/models/index';

export default Model.schema({
    name: {
        type: FieldType.String,
        required: true,
    },
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
});
