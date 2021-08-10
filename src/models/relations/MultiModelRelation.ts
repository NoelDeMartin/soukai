import { arrayUnique, stringToCamelCase } from '@noeldemartin/utils';

import Relation from '@/models/relations/Relation';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

export default abstract class MultiModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    declare public related?: Related[];

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    ) {
        super(
            parent,
            relatedClass,
            foreignKeyName || stringToCamelCase(relatedClass.name + '_' + relatedClass.primaryKey + 's'),
            localKeyName,
        );
    }

    public addRelated(related: Related): void {
        this.related = arrayUnique([
            ...this.related ?? [],
            related,
        ]);
    }

    public abstract resolve(): Promise<Related[]>;

}
