import { tap } from '@noeldemartin/utils';
import type { Constructor } from '@noeldemartin/utils';

import type { MagicAttributes, ModelConstructor, SchemaDefinition } from './inference';
import { Model } from './Model';
import type { Key } from './Model';

export function defineModelSchema<Schema extends SchemaDefinition>(
    definition: Schema,
): Constructor<MagicAttributes<Schema, Key>> & ModelConstructor;
export function defineModelSchema<BaseModel extends Model, Schema extends SchemaDefinition>(
    baseModel: ModelConstructor<BaseModel>,
    definition: Schema,
): Constructor<MagicAttributes<Schema, Key>> & ModelConstructor<BaseModel>;

export function defineModelSchema<BaseModel extends Model, Schema extends SchemaDefinition>(
    baseModelOrDefinition: ModelConstructor<BaseModel> | Schema,
    definition?: Schema,
): Constructor<MagicAttributes<Schema, Key>> & ModelConstructor<BaseModel> {
    const BaseModel = definition ? (baseModelOrDefinition as ModelConstructor) : Model;

    return tap(class extends BaseModel {}, (modelClass) => {
        Object.assign(modelClass, definition ?? baseModelOrDefinition);
    }) as Constructor<MagicAttributes<Schema, Key>> & ModelConstructor<BaseModel>;
}
