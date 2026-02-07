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

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute(this.localKeyName);

        if (!foreignKey) {
            return;
        }

        const foreignKeyName = this.requireForeignKeyName();
        const foreignValue = this.parent.getAttribute(foreignKeyName);
        const foreignValues = Array.isArray(foreignValue) ? foreignValue : [foreignValue];

        if (!foreignValues.includes(foreignKey)) {
            this.parent.setAttribute(foreignKeyName, foreignValues.concat([foreignKey]));
        }
    }

    private async loadRelatedModels(): Promise<Related[]> {
        const foreignKeyValue = this.parent.getAttribute(this.requireForeignKeyName());
        const foreignKeys = Array.isArray(foreignKeyValue) ? foreignKeyValue : [foreignKeyValue];

        if (foreignKeys.length === 0) {
            return [];
        }

        const models = await Promise.all(foreignKeys.map((key) => this.relatedClass.find(String(key))));

        return models.filter((model) => model !== null);
    }

}
