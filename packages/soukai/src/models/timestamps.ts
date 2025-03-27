export const TimestampField = {
    CreatedAt: 'createdAt' as const,
    UpdatedAt: 'updatedAt' as const,
};

export const TIMESTAMP_FIELDS = Object.values(TimestampField);

export type TimestampFieldValue = (typeof TimestampField)[keyof typeof TimestampField];
export type TimestampsDefinition = TimestampFieldValue[] | boolean;
