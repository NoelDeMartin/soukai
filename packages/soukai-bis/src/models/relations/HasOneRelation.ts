import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import SingleModelRelation from './SingleModelRelation';

export default class HasOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related | null> {
        this.related = await this.loadRelatedModel();

        return this.related;
    }

    public setForeignAttributes(related: Related): void {
        related.setAttribute(this.requireForeignKeyName(), this.parent.getAttribute(this.localKeyName));
    }

    private async loadRelatedModel(): Promise<Related | null> {
        const localKey = this.parent.getAttribute(this.localKeyName);

        if (!localKey) {
            return null;
        }

        const foreignKeyName = this.requireForeignKeyName();
        const relatedModels = await this.relatedClass.all();

        return relatedModels.find((model) => model.getAttribute(foreignKeyName) === localKey) ?? null;
    }

}
