import { fail } from '@noeldemartin/utils';

import { SoukaiError } from '@/errors';
import type { Model } from '@/models/Model';
import type { ModelConstructor } from '@/models/inference';

export { default as ModelKey } from './ModelKey';
export * from './deprecated';
export * from './inference';
export * from './Model';
export * from './relations/index';
export * from './schema';

export { TimestampField } from './timestamps';
export { FieldRequired, FieldType, isArrayFieldDefinition, isObjectFieldDefinition } from './fields';

export type {
    ArrayFieldDefinition,
    BasicFieldDefinition,
    BootedArrayFieldDefinition,
    BootedBasicFieldDefinition,
    BootedFieldDefinition,
    BootedFieldDefinitionBase,
    BootedFieldsDefinition,
    BootedObjectFieldDefinition,
    FieldDefinition,
    FieldDefinitionBase,
    FieldsDefinition,
    FieldTypeValue,
    ObjectFieldDefinition,
} from './fields';
export type { Attributes, AttributeValue } from './attributes';
export type { TimestampFieldValue, TimestampsDefinition } from './timestamps';

const bootedModels: Map<string, typeof Model> = new Map;

export function requireBootedModel<T extends ModelConstructor<Model> = ModelConstructor<Model>>(name: string): T {
    return bootedModels.get(name) as T
        ?? fail(SoukaiError, `Could not find Model with name '${name}', are you sure it's booted?`);
}

export function bootModels(models: Record<string, typeof Model>): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        modelClass.boot(modelName);

        bootedModels.set(modelName, modelClass);
    }
}
