import Model from '@/models/Model';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute(this.foreignKeyName);

        this.related = this.localKeyName === this.relatedClass.primaryKey
            ? await this.relatedClass.find<Related>(foreignKey)
            : await this.relatedClass.first<Related>({
                [this.localKeyName]: foreignKey,
            });

        return this.related;
    }

}
