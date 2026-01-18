import type { ModelConstructor, ModelInstanceType, SolidContainerConstructor } from 'soukai-bis/models/types';

import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';
import type MultiModelRelation from './MultiModelRelation';
import type { RelationConstructor } from './types';

export interface SchemaRelationDefinition<
    TRelation extends RelationConstructor = RelationConstructor,
    TRelated extends ModelConstructor = ModelConstructor,
> {
    relatedClass: RelatedModelDefinition<TRelated>;
    relationClass: TRelation;
    foreignKey?: string;
    localKey?: string;
}

// Allow any with function definitions in order to avoid circular references
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RelatedModelDefinition<TRelated extends ModelConstructor = ModelConstructor> = TRelated | (() => any);
export type RelatedSolidContainerDefinition<TRelated extends SolidContainerConstructor = SolidContainerConstructor> =
    | TRelated
    | (() => any); // eslint-disable-line @typescript-eslint/no-explicit-any

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations> = {
    [K in keyof T]?: InstanceType<T[K]['relationClass']> extends MultiModelRelation
        ? GetRelatedModel<T[K]>[]
        : GetRelatedModel<T[K]>;
};

export type GetRelatedModel<T extends SchemaRelationDefinition> = T['relatedClass'] extends () => infer TRelated
    ? ModelInstanceType<TRelated>
    : ModelInstanceType<T['relatedClass']>;

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export function belongsToMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return {
        relatedClass,
        foreignKey,
        relationClass: BelongsToManyRelation,
    };
}

export function belongsToOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return {
        relatedClass,
        foreignKey,
        relationClass: BelongsToOneRelation,
    };
}

export function contains<T extends RelatedModelDefinition>(relatedClass: T) {
    return {
        relatedClass,
        relationClass: ContainsRelation,
    };
}

export function hasMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return {
        relatedClass,
        foreignKey,
        relationClass: HasManyRelation,
    };
}

export function hasOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return {
        relatedClass,
        foreignKey,
        relationClass: HasOneRelation,
    };
}

export function isContainedBy<T extends RelatedSolidContainerDefinition>(relatedClass: T) {
    return {
        relatedClass,
        relationClass: IsContainedByRelation,
    };
}
