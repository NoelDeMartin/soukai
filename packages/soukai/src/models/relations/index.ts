import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import MultiModelRelation from './MultiModelRelation';
import SingleModelRelation from './SingleModelRelation';

export function ensureInverseRelationsBooted(): void {
    if (HasOneRelation.inverseBelongsToRelationClasses.length > 0) {
        return;
    }

    HasOneRelation.inverseBelongsToRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
    HasManyRelation.inverseBelongsToRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
    BelongsToOneRelation.inverseHasRelationClasses = [HasOneRelation, HasManyRelation];
    BelongsToManyRelation.inverseHasRelationClasses = [HasOneRelation, HasManyRelation];
}

export * from './Relation';
export {
    BelongsToManyRelation,
    BelongsToOneRelation,
    HasManyRelation,
    HasOneRelation,
    MultiModelRelation,
    SingleModelRelation,
};
