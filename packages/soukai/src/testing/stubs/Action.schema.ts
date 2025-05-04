import { FieldType, defineModelSchema } from 'soukai/models';

const STATUSES = ['pending', 'completed', 'failed'] as const;

export type ActionStatus = (typeof STATUSES)[number];

export default defineModelSchema({
    fields: {
        status: {
            type: FieldType.String,
            deserialize: (value): ActionStatus | undefined => (STATUSES.includes(value) ? value : undefined),
        },
    },
});
