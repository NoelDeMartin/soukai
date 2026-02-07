import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import SingleModelRelation from './SingleModelRelation';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related | null> {
        this.related = await this.loadRelatedModel();

        return this.related;
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute(this.localKeyName);

        if (!foreignKey) {
            return;
        }

        this.parent.setAttribute(this.requireForeignKeyName(), foreignKey);
    }

    private async loadRelatedModel(): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute(this.requireForeignKeyName());

        if (!foreignKey) {
            return null;
        }

        return this.relatedClass.find(String(foreignKey));
    }

}
