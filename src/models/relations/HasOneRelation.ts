import { ModelConstructor } from '@/models/inference';
import { Model } from '@/models/Model';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

export default class HasOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related | null> {
        const localKey = this.parent.getAttribute<string>(this.localKeyName);

        this.related = await this.relatedClass.first({
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
