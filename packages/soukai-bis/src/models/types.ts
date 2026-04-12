import type { Constructor, Pretty } from '@noeldemartin/utils';

import type Container from './ldp/Container';
import type HasManyRelation from './relations/HasManyRelation';
import type HasOneRelation from './relations/HasOneRelation';
import type Metadata from './crdts/Metadata';
import type Model from './Model';
import type Operation from './crdts/Operation';
import type Tombstone from './crdts/Tombstone';

export type ContainerConstructor<T extends Container = Container> = Constructor<T> & Omit<typeof Container, 'new'>;
export type GetModelAttributes<T extends Model> = T extends Model<infer TAttributes> ? TAttributes : never;
export type GetModelInput<T extends ModelConstructor> = Pretty<NonNullable<ConstructorParameters<T>[0]>>;
export type GetModelRelationName<T extends ModelConstructor> = string & keyof T['schema']['relations'];
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

export type ModelWithTombstones<T extends Model> = T & {
    tombstone: Tombstone;
    relatedTombstone: HasOneRelation<T, Tombstone, typeof Tombstone>;
};
