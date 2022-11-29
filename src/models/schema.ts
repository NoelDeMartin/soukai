import { tap } from '@noeldemartin/utils';

import { Model } from './Model';
import type { Constructor } from '@noeldemartin/utils';
import type { MagicAttributes, ModelConstructor, SchemaDefinition } from './inference';

/* eslint-disable max-len */
export function defineModelSchema<Schema extends SchemaDefinition>(definition: Schema): Constructor<MagicAttributes<Schema>> & ModelConstructor;
export function defineModelSchema<BaseModel extends Model, Schema extends SchemaDefinition>(baseModel: ModelConstructor<BaseModel>, definition: Schema): Constructor<MagicAttributes<Schema>> & ModelConstructor<BaseModel>;
/* eslint-disable max-len */

export function defineModelSchema<BaseModel extends Model, Schema extends SchemaDefinition>(
    baseModelOrDefinition: ModelConstructor<BaseModel> | Schema,
    definition?: Schema,
): Constructor<MagicAttributes<Schema>> & ModelConstructor<BaseModel> {
    const BaseModel = definition ? baseModelOrDefinition as ModelConstructor : Model;

    return tap(class extends BaseModel {}, modelClass => {
        Object.assign(modelClass, definition ?? baseModelOrDefinition);
    }) as Constructor<MagicAttributes<Schema>> & ModelConstructor<BaseModel>;
}
