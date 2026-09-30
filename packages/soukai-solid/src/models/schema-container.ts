import type { Constructor } from '@noeldemartin/utils';

import type { SolidSchemaDefinition } from './fields';
import type { SolidContainerConstructor, SolidMagicAttributes } from './inference';
import { defineSolidModelSchema } from './schema';
import SolidContainer from './SolidContainer';

export function defineSolidContainerSchema<Schema extends SolidSchemaDefinition>(
    definition: Schema,
): Constructor<SolidMagicAttributes<Schema>> & SolidContainerConstructor;
export function defineSolidContainerSchema<BaseModel extends SolidContainer, Schema extends SolidSchemaDefinition>(
    baseModel: SolidContainerConstructor<BaseModel>,
    definition: Schema,
): Constructor<SolidMagicAttributes<Schema>> & SolidContainerConstructor<BaseModel>;

export function defineSolidContainerSchema<BaseModel extends SolidContainer, Schema extends SolidSchemaDefinition>(
    baseModelOrDefinition: SolidContainerConstructor<BaseModel> | Schema,
    definition?: Schema,
): Constructor<SolidMagicAttributes<Schema>> & SolidContainerConstructor<BaseModel> {
    const baseModel = definition ? (baseModelOrDefinition as SolidContainerConstructor) : SolidContainer;

    return defineSolidModelSchema(baseModel, definition ?? (baseModelOrDefinition as Schema)) as unknown as Constructor<
        SolidMagicAttributes<Schema>
    > &
        SolidContainerConstructor<BaseModel>;
}
