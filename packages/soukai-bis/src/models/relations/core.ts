import BelongsToManyRelation from './BelongsToManyRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import ContainsRelation from './ContainsRelation';
import HasManyRelation from './HasManyRelation';
import HasOneRelation from './HasOneRelation';
import IsContainedByRelation from './IsContainedByRelation';

export function bootCoreRelations(): void {
    if (BelongsToManyRelation.inverseHasRelationClasses.length > 0) {
        return;
    }

    BelongsToManyRelation.inverseHasRelationClasses = [HasOneRelation, HasManyRelation];
    BelongsToOneRelation.inverseHasRelationClasses = [HasOneRelation, HasManyRelation];
    ContainsRelation.inverseHasRelationClasses = [IsContainedByRelation];
    HasManyRelation.inverseBelongsToRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
    HasOneRelation.inverseBelongsToRelationClasses = [BelongsToOneRelation, BelongsToManyRelation];
    IsContainedByRelation.inverseBelongsToRelationClasses = [ContainsRelation];
}
