import type { SchemaRelations } from '../relations/schema';
import { defineSchema } from '../schema';
import type { SchemaComputed, SchemaConfig, SchemaFields } from '../schema';
import Container from './Container';

// oxlint-disable-next-line typescript/explicit-module-boundary-types
export function defineContainerSchema<
    TFields extends SchemaFields = {},
    TRelations extends SchemaRelations = {},
    TComputed extends SchemaComputed = {},
>(config: Partial<SchemaConfig<TFields, TRelations, TComputed, typeof Container>>) {
    return defineSchema(Container, {
        ...config,
        fields: config.fields ?? {},
    } as SchemaConfig<TFields, TRelations, TComputed, typeof Container>);
}
