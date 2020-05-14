import Model from '@/models/Model';
import MultiModelRelation from '@/models/relations/MultiModelRelation';

export default class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async resolve(): Promise<Related[]> {
        const foreignKeys = this.parent.getAttribute(this.foreignKeyName);

        this.related = this.localKeyName === this.relatedClass.primaryKey
            ? await this.relatedClass.all<Related>({
                $in: foreignKeys,
            })
            : await this.relatedClass.all<Related>({
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
