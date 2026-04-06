import HasOneRelation from './HasOneRelation';
import BelongsToOneRelation from './BelongsToOneRelation';
import BelongsToManyRelation from './BelongsToManyRelation';
import HasManyRelation from './HasManyRelation';
import IsContainedByRelation from './IsContainedByRelation';
import ContainsRelation from './ContainsRelation';

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
