import { FieldRequired, FieldType, TimestampField, defineModelSchema } from '@/models';

export default defineModelSchema({
    timestamps: [TimestampField.CreatedAt],
    fields: {
        name: {
            type: FieldType.String,
            required: FieldRequired.Required,
        },
        birthRecords: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
    },
});
