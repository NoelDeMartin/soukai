import type { Constructor } from '@noeldemartin/utils';

import type Model from './Model';
import type Container from './Container';

/* eslint-disable max-len */

export type BootedModelClass<T extends typeof Model> = T & { _defaultContainerUrl: string; _modelName: string };
export type GetModelAttributes<T extends Model> = T extends Model<infer TAttributes> ? TAttributes : never;
export type MintedModel<T> = T & { url: string };
export type ModelConstructor<T extends Model = Model> = Constructor<T> & Omit<typeof Model, 'new'>;
export type ModelInstanceType<T> = T extends Constructor<infer TInstance> ? TInstance : never;
export type ContainerConstructor<T extends Container = Container> = Constructor<T> & Omit<typeof Container, 'new'>;
