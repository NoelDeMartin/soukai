import { stringToCamelCase } from '@noeldemartin/utils';

import { ModelConstructor } from '@/models/inference';
import { Model } from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public related: Related | null = null;

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
