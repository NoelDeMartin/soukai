import SingleModelRelation from '@/models/relations/SingleModelRelation';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

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

    public setForeignAttributes(related: Related): void {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey)
            return;

        const foreignValue = related.getAttribute(this.foreignKeyName);

        if (!Array.isArray(foreignValue)) {
            related.setAttribute(this.foreignKeyName, foreignKey);

            return;
        }

        if (foreignValue.includes(foreignKey))
            return;

        related.setAttribute(this.foreignKeyName, [...foreignValue, foreignKey]);
    }

}
