import type Container from 'soukai-bis/models/ldp/Container';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import DocumentContainsManyRelation from './DocumentContainsManyRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';
import { SchemaContainerRelationDefinition, SchemaHasRelationDefinition, SchemaRelationDefinition } from './schema';
import type { RelatedModelName } from './schema';

export interface RelationsRegistry<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> {
    belongsToMany: BelongsToManyRelation<Parent, Related, RelatedClass>;
    belongsToOne: BelongsToOneRelation<Parent, Related, RelatedClass>;
    contains: Parent extends Container ? ContainsRelation<Parent, Related, RelatedClass> : ContainsRelation;
    documentContainsMany: DocumentContainsManyRelation<Parent, Related, RelatedClass>;
    hasMany: HasManyRelation<Parent, Related, RelatedClass>;
    hasOne: HasOneRelation<Parent, Related, RelatedClass>;
    isContainedBy: Related extends Container
        ? RelatedClass extends ModelConstructor<Related> & typeof Container
            ? IsContainedByRelation<Parent, Related, RelatedClass>
            : IsContainedByRelation<Parent>
        : IsContainedByRelation<Parent>;
}

export type RelationKind = keyof RelationsRegistry;

/* oxlint-disable typescript/explicit-module-boundary-types */

export function belongsToMany<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaRelationDefinition<T, typeof BelongsToManyRelation, 'belongsToMany'>(
        relatedModelName,
        BelongsToManyRelation,
        { foreignKey },
    );
}

export function belongsToOne<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaRelationDefinition<T, typeof BelongsToOneRelation, 'belongsToOne'>(
        relatedModelName,
        BelongsToOneRelation,
        { foreignKey },
    );
}

export function contains<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaContainerRelationDefinition<T, typeof ContainsRelation, 'contains'>(
        relatedModelName,
        ContainsRelation,
    );
}

export function documentContainsMany<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaRelationDefinition<T, typeof DocumentContainsManyRelation, 'documentContainsMany'>(
        relatedModelName,
        DocumentContainsManyRelation,
    ).usingSameDocument();
}

export function hasMany<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaHasRelationDefinition<T, typeof HasManyRelation, 'hasMany'>(relatedModelName, HasManyRelation, {
        foreignKey,
    });
}

export function hasOne<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaHasRelationDefinition<T, typeof HasOneRelation, 'hasOne'>(relatedModelName, HasOneRelation, {
        foreignKey,
    });
}

export function isContainedBy<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaContainerRelationDefinition<T, typeof IsContainedByRelation, 'isContainedBy'>(
        relatedModelName,
        IsContainedByRelation,
    );
}
