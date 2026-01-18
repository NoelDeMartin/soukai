import type { ModelConstructor, ModelInstanceType } from 'soukai-bis/models/types';

import BelongsToOneRelation from './BelongsToOneRelation';
import HasOneRelation from 'soukai-bis/models/relations/HasOneRelation';
import type { RelationConstructor } from './types';

export interface SchemaRelationDefinition<
    TRelation extends RelationConstructor = RelationConstructor,
    TRelated extends ModelConstructor = ModelConstructor,
> {
    related: RelatedModelDefinition<TRelated>;
    relationClass: TRelation;
    foreignKey?: string;
    localKey?: string;
}

// Allow any with function definitions in order to avoid circular references
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RelatedModelDefinition<TRelated extends ModelConstructor = ModelConstructor> = TRelated | (() => any);

export type SchemaRelations = Record<string, SchemaRelationDefinition>;
export type SchemaModelRelations<T extends SchemaRelations = SchemaRelations> = {
    [K in keyof T]?: GetRelatedModel<T[K]>;
};

export type GetRelatedModel<T extends SchemaRelationDefinition> = T['related'] extends () => infer TRelated
    ? ModelInstanceType<TRelated>
    : ModelInstanceType<T['related']>;

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export function belongsToOne<T extends RelatedModelDefinition>(related: T, foreignKey: string) {
    return {
        related,
        foreignKey,
        relationClass: BelongsToOneRelation,
    };
}

export function hasOne<T extends RelatedModelDefinition>(related: T, foreignKey: string) {
    return {
        related,
        foreignKey,
        relationClass: HasOneRelation,
    };
}
