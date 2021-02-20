import { ModelConstructor } from '@/models/inference';
import { Model } from '@/models/Model';
import MultiModelRelation from '@/models/relations/MultiModelRelation';

export default class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related[]> {
        const foreignKeys = this.parent.getAttribute<string[]>(this.foreignKeyName);

        this.related = this.localKeyName === this.relatedClass.primaryKey
            ? await this.relatedClass.all({
                $in: foreignKeys,
            })
            : await this.relatedClass.all({
                [this.localKeyName]: {
                    $or: [
                        ...foreignKeys.map(key => ({ $eq: key })),
                        ...foreignKeys.map(key => ({ $contains: key })),
                    ],
                },
            });

        return this.related;
    }

}
