import type { Constructor } from '@noeldemartin/utils';

import type Container from './ldp/Container';
import type HasManyRelation from './relations/HasManyRelation';
import type HasOneRelation from './relations/HasOneRelation';
import type Metadata from './crdts/Metadata';
import type Model from './Model';
import type Operation from './crdts/Operation';

export type ContainerConstructor<T extends Container = Container> = Constructor<T> & Omit<typeof Container, 'new'>;
export type GetModelAttributes<T extends Model> = T extends Model<infer TAttributes> ? TAttributes : never;
export type ModelConstructor<T extends Model = Model> = Constructor<T> & Omit<typeof Model, 'new'>;
export type ModelInstanceType<T> = T extends ModelConstructor<infer TInstance> ? TInstance : never;
export type ModelWithUrl<T extends Model = Model> = T & { url: string };

export type ModelWithTimestamps<T extends Model = Model> = T & {
    createdAt: Date;
    updatedAt: Date;
    metadata: Metadata;
    relatedMetadata: HasOneRelation<T, Metadata, typeof Metadata>;
};

export type ModelWithHistory<T extends Model> = T & {
    operations: Operation[];
    relatedOperations: HasManyRelation<T, Operation, typeof Operation>;
};
