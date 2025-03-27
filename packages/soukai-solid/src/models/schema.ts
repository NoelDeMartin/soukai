import type { Constructor } from '@noeldemartin/utils';

import { bootSolidSchemaDecoupled, defineSolidModelSchemaDecoupled } from './internals/helpers';
import { SolidModel } from './SolidModel';
import type { SolidMagicAttributes, SolidModelConstructor } from './inference';
import type { SolidSchemaDefinition } from './fields';

export function bootSolidSchema<BaseModel extends SolidModel, Schema extends SolidSchemaDefinition>(
    baseModelOrDefinition: SolidModelConstructor<BaseModel> | Schema,
    definition?: Schema,
): SolidModelConstructor {
    return bootSolidSchemaDecoupled(baseModelOrDefinition, SolidModel, definition);
}

/* eslint-disable max-len */
export function defineSolidModelSchema<Schema extends SolidSchemaDefinition>(
    definition: Schema
): Constructor<SolidMagicAttributes<Schema>> & SolidModelConstructor;
export function defineSolidModelSchema<BaseModel extends SolidModel, Schema extends SolidSchemaDefinition>(
    baseModel: SolidModelConstructor<BaseModel>,
    definition: Schema
): Constructor<SolidMagicAttributes<Schema>> & SolidModelConstructor<BaseModel>;
/* eslint-enable max-len */

export function defineSolidModelSchema<BaseModel extends SolidModel, Schema extends SolidSchemaDefinition>(
    baseModelOrDefinition: SolidModelConstructor<BaseModel> | Schema,
    definition?: Schema,
): Constructor<SolidMagicAttributes<Schema>> & SolidModelConstructor<BaseModel> {
    return defineSolidModelSchemaDecoupled(baseModelOrDefinition, SolidModel, definition);
}
