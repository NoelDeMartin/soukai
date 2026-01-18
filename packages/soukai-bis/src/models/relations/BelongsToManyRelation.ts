import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import MultiModelRelation from './MultiModelRelation';

export default class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related[]> {
        this.related = await this.loadRelatedModels();

        return this.related;
    }

    private async loadRelatedModels(): Promise<Related[]> {
        const foreignKeyValue = this.parent.getAttribute(this.foreignKeyName);
        const foreignKeys = Array.isArray(foreignKeyValue) ? foreignKeyValue : [foreignKeyValue];

        if (foreignKeys.length === 0) {
            return [];
        }

        const models = await Promise.all(foreignKeys.map((key) => this.relatedClass.find(String(key))));

        return models.filter((model) => model !== null);
    }

}
