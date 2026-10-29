import { type Nullable, tap, uuid } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import { CLASS_MARKER, MODEL_IN_OTHER_DOCUMENT_ID, MODEL_IN_SAME_DOCUMENT, NEW_MODEL } from './internals';
import Relation from './Relation';
import type { DetachOptions } from './Relation';
import type { GetRelatedModelInput } from './types';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> extends Relation<Parent, Related, RelatedClass, ForeignKeyName> {
    public static [CLASS_MARKER] = ['SingleModelRelation'];

    declare public [NEW_MODEL]?: Related;
    declare public [MODEL_IN_SAME_DOCUMENT]?: Related;
    declare public [MODEL_IN_OTHER_DOCUMENT_ID]?: string;

    public get related(): Nullable<Related> {
        return this._related as Nullable<Related>;
    }

    public set related(related: Nullable<Related>) {
        this._related = related;

        related && this.setInverseRelations(related);
    }

    public attach(model: Related, options?: { mintUrl?: boolean }): Related;
    public attach(
        attributes: GetRelatedModelInput<RelatedClass, ForeignKeyName>,
        options?: { mintUrl?: boolean },
    ): Related;

    public attach(
        modelOrAttributes: Related | GetRelatedModelInput<RelatedClass, ForeignKeyName>,
        options?: { mintUrl?: boolean },
    ): Related {
        const model =
            modelOrAttributes instanceof this.relatedClass
                ? (modelOrAttributes as Related)
                : this.relatedClass.newInstance(this.addForeignAttributes(modelOrAttributes));

        return tap(model, () => {
            if (this.loaded && this.related && !this.isRelated(model)) {
                throw new SoukaiError(
                    'The "attach" method can\'t be called because a related model already exists, ' +
                        'use a hasMany relationship if you want to support multiple related models.',
                );
            }

            if (options?.mintUrl) {
                model.mintUrl(
                    this.usingSameDocument
                        ? {
                              documentUrl: this.parent.getDocumentUrl() ?? undefined,
                              resourceHash: uuid(),
                          }
                        : { containerUrl: this.parent.url },
                );
            }

            this.setRelated(model);
            this.forgetDetachedModel(model);
            this.setInverseRelations(model);
            this.setForeignAttributes(model);
        });
    }

    public detach(options: DetachOptions = {}): Related | null {
        const related = this.related;

        if (!related) {
            return null;
        }

        this.related = null;

        if (this[NEW_MODEL] === related) {
            delete this[NEW_MODEL];
        }

        if (this[MODEL_IN_SAME_DOCUMENT] === related) {
            delete this[MODEL_IN_SAME_DOCUMENT];
        }

        if (this[MODEL_IN_OTHER_DOCUMENT_ID] === related.url) {
            delete this[MODEL_IN_OTHER_DOCUMENT_ID];
        }

        this.detachModel(related, options);

        return related;
    }

    public async delete(): Promise<void> {
        if (!this.related) {
            return;
        }

        const related = this.related;

        this.related = null;

        await related.delete();
    }

    public isEmpty(): boolean | null {
        if (!this.documentModelsLoaded && this.parent.exists()) {
            return null;
        }

        return !(this[MODEL_IN_SAME_DOCUMENT] || this[MODEL_IN_OTHER_DOCUMENT_ID] || this[NEW_MODEL] || this.related);
    }

    public isRelated(related: Related): boolean {
        return this.related === related;
    }

    public setRelated(related: Related): void {
        if (this.isRelated(related)) {
            return;
        }

        this.related = related;

        if (!related.exists()) {
            this[NEW_MODEL] = related;
        }
    }

    public abstract load(): Promise<Related | null>;
}
