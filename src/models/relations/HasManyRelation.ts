import MultiModelRelation from 'soukai/models/relations/MultiModelRelation';
import type { ModelConstructor } from 'soukai/models/inference';
import type { Model } from 'soukai/models/Model';

export default class HasManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related[]> {
        const localKey = this.parent.getAttribute<string>(this.localKeyName);

        this.related = await this.relatedClass.all({
            [this.foreignKeyName]: {
                $or: [{ $eq: localKey }, { $contains: localKey }],
            },
        });

        return this.related;
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey) return;

        const foreignValue = related.getAttribute(this.foreignKeyName);

        if (!Array.isArray(foreignValue)) {
            related.setAttribute(this.foreignKeyName, foreignKey);

            return;
        }

        if (foreignValue.includes(foreignKey)) return;

        related.setAttribute(this.foreignKeyName, [...foreignValue, foreignKey]);
    }

}
