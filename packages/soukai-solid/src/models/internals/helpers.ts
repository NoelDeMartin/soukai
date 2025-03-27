import { fail } from '@noeldemartin/utils';
import { SoukaiError, defineModelSchema } from 'soukai';
import type { Constructor } from '@noeldemartin/utils';
import type { SchemaDefinition } from 'soukai';

import type { RDFContexts, SolidSchemaDefinition } from 'soukai-solid/models/fields';
import type { SolidMagicAttributes, SolidModelConstructor } from 'soukai-solid/models/inference';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

const ongoingUpdates = new WeakMap<SolidModelConstructor, RDFContexts>();
const bootedSchemas = new WeakMap<SolidSchemaDefinition, SolidModelConstructor>();

function isModelClass(schema: SolidSchemaDefinition | SolidModelConstructor): schema is SolidModelConstructor {
    return Object.getPrototypeOf(schema)?.constructor !== Object;
}

export function startSchemaUpdate(modelClass: SolidModelConstructor, context: RDFContexts): void {
    if (ongoingUpdates.has(modelClass)) {
        throw new SoukaiError(`${modelClass.modelName} schema update already in progress!`);
    }

    ongoingUpdates.set(modelClass, context);
}

export function getSchemaUpdateContext(modelClass: SolidModelConstructor): RDFContexts | null {
    const context = ongoingUpdates.get(modelClass);

    return context ?? null;
}

export function stopSchemaUpdate(modelClass: SolidModelConstructor): void {
    ongoingUpdates.delete(modelClass);
}

export function bootSolidSchemaDecoupled<BaseModel extends SolidModel, Schema extends SchemaDefinition>(
    baseModelOrDefinition: SolidModelConstructor<BaseModel> | Schema,
    defaultModel: SolidModelConstructor,
    definition?: Schema,
): SolidModelConstructor {
    const schema = definition ?? baseModelOrDefinition;

    if (isModelClass(schema)) {
        schema.ensureBooted();

        return schema;
    }

    if (!bootedSchemas.has(schema)) {
        const baseModel = isModelClass(baseModelOrDefinition) ? baseModelOrDefinition : defaultModel;
        const bootedSchema = defineSolidModelSchemaDecoupled(schema, baseModel);

        bootedSchema.ensureBooted();

        bootedSchemas.set(schema, bootedSchema);
    }

    return bootedSchemas.get(schema) ?? fail('Couldn\'t boot schema');
}

export function defineSolidModelSchemaDecoupled<BaseModel extends SolidModel, Schema extends SchemaDefinition>(
    baseModelOrDefinition: SolidModelConstructor<BaseModel> | Schema,
    defaultModel: SolidModelConstructor,
    definition?: Schema,
): Constructor<SolidMagicAttributes<Schema>> & SolidModelConstructor<BaseModel> {
    const baseModel = definition ? (baseModelOrDefinition as SolidModelConstructor) : defaultModel;
    const schema = defineModelSchema(
        baseModel,
        definition ?? (baseModelOrDefinition as Schema),
    ) as unknown as Constructor<SolidMagicAttributes<Schema>> & SolidModelConstructor<BaseModel>;

    schema.__isSchema = true;

    return schema;
}
