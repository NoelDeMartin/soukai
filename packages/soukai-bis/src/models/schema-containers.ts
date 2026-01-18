import SolidContainer from './SolidContainer';
import { defineSchema } from './schema';
import type { SchemaRelations } from './relations/schema';
import type { SchemaConfig, SchemaFields } from './schema';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function defineContainerSchema<TFields extends SchemaFields, TRelations extends SchemaRelations>(
    config: Partial<SchemaConfig<TFields, TRelations>>,
) {
    return defineSchema(SolidContainer, {
        ...config,
        fields: config.fields ?? {},
    } as SchemaConfig<TFields, TRelations>);
}
