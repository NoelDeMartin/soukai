import { mixed } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import BelongsToRelation from './BelongsToRelation';
import { MODEL_IN_OTHER_DOCUMENT_ID, MODEL_IN_SAME_DOCUMENT } from './internals';
import type { LoadFromDocumentRDFOptions, RelationLoadOptions } from './Relation';
import SingleModelRelation from './SingleModelRelation';

export default class BelongsToOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends mixed(SingleModelRelation, [BelongsToRelation])<Parent, Related, RelatedClass> {
    public async load(options: RelationLoadOptions = {}): Promise<Related | null> {
        this.related = await this.loadRelatedModel(options);

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: LoadFromDocumentRDFOptions = {}): Promise<void> {
        const foreignKey = this.parent.getAttribute(this.requireForeignKeyName());
        const related = foreignKey
            ? await this.relatedClass.createFromRDF(quads, {
                  ...options,
                  // oxlint-disable-next-line typescript/no-base-to-string
                  url: String(foreignKey),
              })
            : null;

        this.documentModelsLoaded = true;

        if (related) {
            this[MODEL_IN_SAME_DOCUMENT] = related;
            this.related = related;
        } else if (this.usingSameDocument) {
            this.related = null;
        } else if (foreignKey) {
            // oxlint-disable-next-line typescript/no-base-to-string
            this[MODEL_IN_OTHER_DOCUMENT_ID] = String(foreignKey);
        }
    }

    public isEmpty(): boolean {
        return !this.parent.getAttribute(this.requireForeignKeyName());
    }

    public setForeignAttributes(related: Related): void {
        const foreignKey = related.getAttribute(this.localKeyName);

        if (!foreignKey) {
            related.once('saved', () => this.isRelated(related) && this.setForeignAttributes(related));

            return;
        }

        this.parent.setAttribute(this.requireForeignKeyName(), foreignKey);
    }

    private async loadRelatedModel(options: RelationLoadOptions): Promise<Related | null> {
        const foreignKey = this.parent.getAttribute(this.requireForeignKeyName());

        if (!foreignKey) {
            return null;
        }

        // oxlint-disable-next-line typescript/no-base-to-string
        return this.relatedClass.find(String(foreignKey), {
            modelsCache: this.getDocumentModelsCache(),
            includeSoftDeleted: options.includeSoftDeleted,
        });
    }
}
