import { mixed } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';

import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import HasRelation from './HasRelation';
import MultiModelRelation from './MultiModelRelation';

export default class HasManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends mixed(MultiModelRelation, [HasRelation])<Parent, Related, RelatedClass> {

    public async load(): Promise<Related[]> {
        this.related = await this.loadRelatedModels();

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: { modelsCache?: Map<string, Model> } = {}): Promise<void> {
        const related = await this.loadRelatedModelsFromDocumentRDF(quads, options);

        this.documentModelsLoaded = true;

        if (related.length > 0) {
            this.related = related;
            this.__modelsInSameDocument = related;
        } else if (this.usingSameDocument) {
            this.related = [];
        }
    }

    protected async loadRelatedModels(): Promise<Related[]> {
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

    protected async loadRelatedModelsFromDocumentRDF(
        quads: Quad[],
        options: { modelsCache?: Map<string, Model> } = {},
    ): Promise<Related[]> {
        const localKey = this.parent.getAttribute(this.localKeyName);
        const allRelated = await this.relatedClass.createManyFromRDF(quads, { modelsCache: options.modelsCache });

        return allRelated.filter((model) => model.getAttribute(this.requireForeignKeyName()) === localKey);
    }

}
