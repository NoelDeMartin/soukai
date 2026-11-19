import type { SchemaRelations } from '../relations/schema';
import { defineSchema } from '../schema';
import type { SchemaComputed, SchemaConfig, SchemaFields, SchemaTimestamps } from '../schema';
import Container from './Container';

// oxlint-disable-next-line typescript/explicit-module-boundary-types
export function defineContainerSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TComputed extends SchemaComputed = {},
    TTimestamps extends SchemaTimestamps | undefined = undefined,
>(config: Partial<SchemaConfig<TFields, TRelations, TComputed, TTimestamps, typeof Container>>) {
    return defineSchema(Container, {
        ...config,
        fields: config.fields ?? {},
    } as SchemaConfig<TFields, TRelations, TComputed, TTimestamps, typeof Container>);
}
