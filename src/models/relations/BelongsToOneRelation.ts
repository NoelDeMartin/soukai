import { ModelConstructor } from '@/models/inference';
import { Model } from '@/models/Model';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute<string>(this.foreignKeyName);

        this.related = this.localKeyName === this.relatedClass.primaryKey
            ? await this.relatedClass.find(foreignKey)
            : await this.relatedClass.first({
                [this.localKeyName]: foreignKey,
            });

        return this.related;
    }

}
