import MultiModelRelation from '@/models/relations/MultiModelRelation';
import type { ModelConstructor } from '@/models/inference';
import type { Key, Model } from '@/models/Model';

export default class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public isEmpty(): boolean | null {
        return this.parent.getAttribute<Key[]>(this.foreignKeyName).length === 0;
    }

    public async resolve(): Promise<Related[]> {
        const foreignKeys = this.parent.getAttribute<Key[]>(this.foreignKeyName);

        this.related = this.isEmpty()
            ? []
            : (
                this.localKeyName === this.relatedClass.primaryKey
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
                    })
            );

        return this.related;
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute<string>(this.localKeyName);

        if (!foreignKey)
            return;

        const foreignValues = this.parent.getAttribute<string[]>(this.foreignKeyName);

        if (!foreignValues.includes(foreignKey))
            this.parent.setAttribute(this.foreignKeyName, [...foreignValues, foreignKey]);
    }

}
