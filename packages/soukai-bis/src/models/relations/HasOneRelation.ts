import { mixed } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';

import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor, ModelsCache } from 'soukai-bis/models/types';

import HasRelation from './HasRelation';
import SingleModelRelation from './SingleModelRelation';

export default class HasOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> extends mixed(SingleModelRelation, [HasRelation])<Parent, Related, RelatedClass, ForeignKeyName> {

    public async load(): Promise<Related | null> {
        this.related = await this.loadRelatedModel();

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: { modelsCache?: ModelsCache } = {}): Promise<void> {
        const localKey = this.parent.getAttribute(this.localKeyName);
        const allRelated = await this.relatedClass.createManyFromRDF(quads, { modelsCache: options.modelsCache });
        const related = allRelated.find((model) => model.getAttribute(this.requireForeignKeyName()) === localKey);

        this.related = related;
        this.documentModelsLoaded = true;

        if (related) {
            this.__modelInSameDocument = related;

            if (this.__newModel) {
                delete this.__newModel;
            }
        } else if (this.usingSameDocument) {
            this.related = null;
        }
    }

    private async loadRelatedModel(): Promise<Related | null> {
        const localKey = this.parent.getAttribute(this.localKeyName);

        if (!localKey) {
            return null;
        }

        const foreignKeyName = this.requireForeignKeyName();

        if (this.usingSameDocument) {
            const documentUrl = this.parent.getDocumentUrl();

            if (!documentUrl || !this.parent.exists()) {
                return null;
            }

            const engine = this.relatedClass.requireEngine();
            const document = await engine.readDocument(documentUrl);
            const relatedModels = await this.relatedClass.createManyFromDocument(document);

            return relatedModels.find((model) => model.getAttribute(foreignKeyName) === localKey) ?? null;
        }

        const relatedModels = await this.relatedClass.all();

        return relatedModels.find((model) => model.getAttribute(foreignKeyName) === localKey) ?? null;
    }

}
