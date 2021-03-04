import SingleModelRelation from '@/models/relations/SingleModelRelation';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

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
