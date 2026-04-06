import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import type Relation from './Relation';
import type { GetRelatedModelInput } from './types';

export default class BelongsToRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> {

    public addForeignAttributes<T extends GetRelatedModelInput<RelatedClass, ForeignKeyName>>(
        this: Relation<Parent, Related, RelatedClass, ForeignKeyName>,
        attributes: T,
    ): T {
        // nothing to do here, the related class doesn't have any foreign keys.

        return attributes;
    }

}
