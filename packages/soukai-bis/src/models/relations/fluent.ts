import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';
import { SchemaRelationDefinition } from './schema';
import type { RelatedContainerDefinition, RelatedModelDefinition } from './schema';

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

export function belongsToMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, BelongsToManyRelation, { foreignKey });
}

export function belongsToOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, BelongsToOneRelation, { foreignKey });
}

export function contains<T extends RelatedModelDefinition>(relatedClass: T) {
    return new SchemaRelationDefinition(relatedClass, ContainsRelation);
}

export function hasMany<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, HasManyRelation, { foreignKey });
}

export function hasOne<T extends RelatedModelDefinition>(relatedClass: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedClass, HasOneRelation, {
        foreignKey,
    });
}

export function isContainedBy<T extends RelatedContainerDefinition>(relatedClass: T) {
    return new SchemaRelationDefinition(relatedClass, IsContainedByRelation);
}
