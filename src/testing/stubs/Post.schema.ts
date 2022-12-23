import { FieldType, defineModelSchema } from '@/models';

export default defineModelSchema({
    fields: {
        title: {
            type: FieldType.String,
            required: true,
        },
        body: FieldType.String,
        authorId: FieldType.Key,
    },
});
