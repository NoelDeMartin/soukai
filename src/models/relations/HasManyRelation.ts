import MultiModelRelation from '@/models/relations/MultiModelRelation';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

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

    public setForeignAttributes(related: Related): void {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey)
            return;

        const foreignValue = related.getAttribute(this.foreignKeyName);

        Array.isArray(foreignValue)
            ? related.setAttribute(this.foreignKeyName, [...foreignValue, foreignKey])
            : related.setAttribute(this.foreignKeyName, foreignKey);
    }

}
