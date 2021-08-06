import SingleModelRelation from '@/models/relations/SingleModelRelation';
import type { ModelConstructor } from '@/models/inference';
import type { Key, Model } from '@/models/Model';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public isEmpty(): boolean | null {
        return !this.parent.getAttribute<Key>(this.foreignKeyName);
    }

    public async resolve(): Promise<Related | null> {
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

    protected initializeInverse(parent: Parent, related: Related): void {
        parent.setAttribute(this.foreignKeyName, related.getPrimaryKey());

        this.related = related;
    }

}
