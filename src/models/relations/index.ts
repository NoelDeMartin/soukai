import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import MultiModelRelation from './MultiModelRelation';
import SingleModelRelation from './SingleModelRelation';

HasOneRelation.inverseRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
HasManyRelation.inverseRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
BelongsToOneRelation.inverseRelationClasses = [HasOneRelation, HasManyRelation];
BelongsToManyRelation.inverseRelationClasses = [HasOneRelation, HasManyRelation];

export * from './Relation';
export {
    BelongsToManyRelation,
    BelongsToOneRelation,
    HasManyRelation,
    HasOneRelation,
    MultiModelRelation,
    SingleModelRelation,
};
