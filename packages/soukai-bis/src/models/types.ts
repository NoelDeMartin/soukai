import type { Constructor } from '@noeldemartin/utils';

import type Model from './Model';

export type ModelConstructor<T extends Model = Model> = Constructor<T> & Omit<typeof Model, 'new'>;
export type ModelInstanceType<T> = T extends Constructor<infer TInstance> ? TInstance : never;
export type MintedModel<T> = T & { url: string };
export type BootedModelClass<T extends typeof Model> = T & { _defaultContainerUrl: string; _modelName: string };
