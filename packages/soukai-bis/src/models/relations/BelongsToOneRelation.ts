import type { ModelConstructor } from 'soukai-bis/models/types';
import type Model from 'soukai-bis/models/Model';

import Relation from './Relation';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public async load(): Promise<Related | null> {
        this.related = await this.loadRelatedModel();

        return this.related;
    }

    private async loadRelatedModel(): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute(this.foreignKeyName);

        if (!foreignKey) {
            return null;
        }

        return this.relatedClass.find(String(foreignKey));
    }

}
