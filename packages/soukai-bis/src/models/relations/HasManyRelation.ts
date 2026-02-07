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

    public setForeignAttributes(related: Related): void {
        const foreignKey = this.parent.getAttribute(this.localKeyName);

        if (!foreignKey) {
            return;
        }

        const foreignKeyName = this.requireForeignKeyName();
        const foreignValue = related.getAttribute(foreignKeyName);

        if (!Array.isArray(foreignValue)) {
            related.setAttribute(foreignKeyName, foreignKey);

            return;
        }

        if (foreignValue.includes(foreignKey)) {
            return;
        }

        related.setAttribute(foreignKeyName, foreignValue.concat([foreignKey]));
    }

    private async loadRelatedModels(): Promise<Related[]> {
        const localKey = this.parent.getAttribute(this.localKeyName);
        const foreignKeyName = this.requireForeignKeyName();

        if (!localKey) {
            return [];
        }

        if (this.usingSameDocument) {
            const documentUrl = this.parent.getDocumentUrl();

            if (!documentUrl) {
                return [];
            }

            const engine = this.relatedClass.requireEngine();
            const document = await engine.readDocument(documentUrl);
            const relatedModels = await this.relatedClass.createManyFromDocument(document);

            return relatedModels.filter((model) => model.getAttribute(foreignKeyName) === localKey);
        }

        const relatedModels = await this.relatedClass.all();

        return relatedModels.filter((model) => model.getAttribute(foreignKeyName) === localKey);
    }

}
