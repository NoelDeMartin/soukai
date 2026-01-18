import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import MultiModelRelation from './MultiModelRelation';

export default class HasManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related[]> {
        this.related = await this.loadRelatedModels();

        return this.related;
    }

    private async loadRelatedModels(): Promise<Related[]> {
        const localKey = this.parent.getAttribute(this.localKeyName);

        if (!localKey) {
            return [];
        }

        const relatedModels = await this.relatedClass.all();

        return relatedModels.filter((model) => model.getAttribute(this.foreignKeyName) === localKey);
    }

}
