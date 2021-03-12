import type { Model } from '@/models/Model';

export * from './inference';
export * from './Model';
export * from './relations/index';

export {
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
    FieldRequired,
    FieldsDefinition,
    FieldType,
    FieldTypeValue,
    ObjectFieldDefinition,
    TimestampField,
    TimestampFieldValue,
} from './fields';

export type { Attributes, AttributeValue } from './attributes';

export function bootModels(models: Record<string, typeof Model>): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        modelClass.boot(modelName);
    }
}
