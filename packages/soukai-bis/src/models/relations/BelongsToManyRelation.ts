import { arrayFrom, isTruthy, mixed, urlRoute } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import BelongsToRelation from './BelongsToRelation';
import { MODELS_IN_OTHER_DOCUMENT_IDS, MODELS_IN_SAME_DOCUMENT } from './internals';
import MultiModelRelation from './MultiModelRelation';
import type { LoadFromDocumentRDFOptions, RelationLoadOptions } from './Relation';

export default class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends mixed(MultiModelRelation, [BelongsToRelation])<Parent, Related, RelatedClass> {
    public async load(options: RelationLoadOptions = {}): Promise<Related[]> {
        this.related = await this.loadRelatedModels(options);

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: LoadFromDocumentRDFOptions = {}): Promise<void> {
        const foreignKeyValue = this.parent.getAttribute(this.requireForeignKeyName());
        // oxlint-disable-next-line typescript/no-base-to-string
        const foreignKeys = arrayFrom(foreignKeyValue, { ignoreEmptyValues: true }).map((value) => String(value));
        const allRelated = await this.relatedClass.createManyFromRDF(quads, options);
        const related = allRelated.filter((model) =>
            foreignKeys.includes(model.getAttribute(this.localKeyName) as string),
        );
        const relatedKeys = related.map((model) => model.getAttribute(this.localKeyName));

        this[MODELS_IN_SAME_DOCUMENT] = related;
        this[MODELS_IN_OTHER_DOCUMENT_IDS] = this.usingSameDocument
            ? []
            : foreignKeys.filter((key) => !relatedKeys.includes(key));
        this.documentModelsLoaded = true;

        if (this[MODELS_IN_OTHER_DOCUMENT_IDS].length === 0) {
            this.related = related;
        }
    }

    public isEmpty(): boolean {
        const foreignKeyName = this.requireForeignKeyName();
        const foreignValue = this.parent.getAttribute(foreignKeyName);
        const foreignValues = arrayFrom(foreignValue, { ignoreEmptyValues: true });

        return foreignValues.length === 0;
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute(this.localKeyName);

        if (!foreignKey) {
            related.once('saved', () => this.isRelated(related) && this.setForeignAttributes(related));

            return;
        }

        const foreignKeyName = this.requireForeignKeyName();
        const foreignValue = this.parent.getAttribute(foreignKeyName);
        const foreignValues = arrayFrom(foreignValue, { ignoreEmptyValues: true });

        if (foreignValues.includes(foreignKey)) {
            return;
        }

        this.parent.setAttribute(foreignKeyName, foreignValues.concat([foreignKey]));
    }

    private async loadRelatedModels(options: RelationLoadOptions): Promise<Related[]> {
        const foreignKeyValue = this.parent.getAttribute(this.requireForeignKeyName());
        const foreignKeys = arrayFrom(foreignKeyValue, { ignoreEmptyValues: true }).map(String);

        if (foreignKeys.length === 0) {
            return [];
        }

        const engine = this.relatedClass.requireEngine();
        const documentUrls = foreignKeys.map(urlRoute);
        const documents = await engine.readDocuments({ urls: documentUrls });
        const modelsCache = this.getDocumentModelsCache();
        const models = await Promise.all(
            foreignKeys.map(async (url) => {
                const document = documents[urlRoute(url)];

                return (
                    document &&
                    this.relatedClass.createFromDocument(document, {
                        url,
                        modelsCache,
                        includeSoftDeleted: options.includeSoftDeleted,
                    })
                );
            }),
        );

        return models.filter(isTruthy);
    }
}
