import { stringToCamelCase } from '@noeldemartin/utils';

import Relation from '@/models/relations/Relation';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    declare public related?: Related | null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    ) {
        super(
            parent,
            relatedClass,
            foreignKeyName || stringToCamelCase(relatedClass.name + '_' + relatedClass.primaryKey),
            localKeyName,
        );
    }

    public abstract resolve(): Promise<Related | null>;

}
