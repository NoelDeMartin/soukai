import SingleModelRelation from 'soukai/models/relations/SingleModelRelation';
import type { ModelConstructor } from 'soukai/models/inference';
import type { Key, Model } from 'soukai/models/Model';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public isEmpty(): boolean | null {
        return !this.parent.getAttribute<Key>(this.foreignKeyName);
    }

    public async load(): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute<Key>(this.foreignKeyName);

        this.related = this.isEmpty()
            ? null
            : (
                this.localKeyName === this.relatedClass.primaryKey
                    ? await this.relatedClass.find(foreignKey)
                    : await this.relatedClass.first({ [this.localKeyName]: foreignKey })
            );

        return this.related;
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute(this.localKeyName);

        if (!foreignKey)
            return;

        this.parent.setAttribute(this.foreignKeyName, foreignKey);
    }

}
