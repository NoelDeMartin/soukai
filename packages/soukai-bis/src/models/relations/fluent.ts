import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import DocumentContainsManyRelation from './DocumentContainsManyRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';
import { SchemaHasRelationDefinition, SchemaRelationDefinition } from './schema';
import type { RelatedModelName } from './schema';

/* oxlint-disable typescript/explicit-module-boundary-types */

export function belongsToMany<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedModelName, BelongsToManyRelation, { foreignKey });
}

export function belongsToOne<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaRelationDefinition(relatedModelName, BelongsToOneRelation, { foreignKey });
}

export function contains<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaRelationDefinition(relatedModelName, ContainsRelation);
}

export function documentContainsMany<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaRelationDefinition(relatedModelName, DocumentContainsManyRelation).usingSameDocument();
}

export function hasMany<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaHasRelationDefinition(relatedModelName, HasManyRelation, { foreignKey });
}

export function hasOne<T extends RelatedModelName>(relatedModelName: T, foreignKey: string) {
    return new SchemaHasRelationDefinition(relatedModelName, HasOneRelation, { foreignKey });
}

export function isContainedBy<T extends RelatedModelName>(relatedModelName: T) {
    return new SchemaRelationDefinition(relatedModelName, IsContainedByRelation);
}
