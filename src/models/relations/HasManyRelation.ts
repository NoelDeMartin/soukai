import { ModelConstructor } from '@/models/inference';
import { Model } from '@/models/Model';
import MultiModelRelation from '@/models/relations/MultiModelRelation';

export default class HasManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related[]> {
        const localKey = this.parent.getAttribute<string>(this.localKeyName);

        this.related = await this.relatedClass.all({
            [this.foreignKeyName]: {
                $or: [
                    { $eq: localKey },
                    { $contains: localKey },
                ],
            },
        });

        return this.related;
    }

}
