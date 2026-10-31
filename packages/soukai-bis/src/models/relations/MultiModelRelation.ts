import { arrayRemove, tap, uuid } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import { emitModelEvent } from 'soukai-bis/models/concerns/events';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import { CLASS_MARKER, MODELS_IN_OTHER_DOCUMENT_IDS, MODELS_IN_SAME_DOCUMENT, NEW_MODELS } from './internals';
import Relation from './Relation';
import type { DetachOptions } from './Relation';
import type { GetRelatedModelInput } from './types';

export default abstract class MultiModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> extends Relation<Parent, Related, RelatedClass, ForeignKeyName> {
    public static [CLASS_MARKER] = ['MultiModelRelation'];

    declare public [NEW_MODELS]?: Related[];
    declare public [MODELS_IN_SAME_DOCUMENT]?: Related[];
    declare public [MODELS_IN_OTHER_DOCUMENT_IDS]?: string[];

    public get related(): Nullable<Related[]> {
        return this._related as Nullable<Related[]>;
    }

    public set related(related: Nullable<Related[]>) {
        this._related = related;

        for (const model of related ?? []) {
            this.setInverseRelations(model);
        }
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
            const remainsUnloaded = this.remainsUnloadedAfterAttach();

            if (!remainsUnloaded) {
                this.assertLoaded('attach');
            }

            if (this.isRelated(model)) {
                return;
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

            if (!remainsUnloaded) {
                this.addRelated(model);
            }

            this.forgetDetachedModel(model);
            this.setInverseRelations(model);
            this.setForeignAttributes(model);
        });
    }

    public detach(related: Related | Related[], options: DetachOptions = {}): Related[] {
        this.assertLoaded('detach');

        const detachedModels = (Array.isArray(related) ? related : [related]).filter((model) => this.isRelated(model));

        if (detachedModels.length === 0) {
            return [];
        }

        const detachedUrls = detachedModels.map((model) => model.url);
        const isDetached = (model: Related) => detachedModels.includes(model);

        this.related = this.related?.filter((model) => !isDetached(model));
        this[NEW_MODELS] = this[NEW_MODELS]?.filter((model) => !isDetached(model));
        this[MODELS_IN_SAME_DOCUMENT] = this[MODELS_IN_SAME_DOCUMENT]?.filter((model) => !isDetached(model));
        this[MODELS_IN_OTHER_DOCUMENT_IDS] = this[MODELS_IN_OTHER_DOCUMENT_IDS]?.filter(
            (url) => !detachedUrls.includes(url),
        );

        for (const model of detachedModels) {
            this.detachModel(model, options);
        }

        return detachedModels;
    }

    public async delete(related: Related | Related[]): Promise<void> {
        this.assertLoaded('delete');

        const relatedArray = Array.isArray(related) ? related : [related];

        await Promise.all(
            relatedArray.map(async (relatedModel) => {
                if (!this.related?.includes(relatedModel)) {
                    return;
                }

                await relatedModel.delete();

                arrayRemove(this.related, relatedModel);
            }),
        );

        await emitModelEvent(this.parent, 'updated');
    }

    public isEmpty(): boolean | null {
        if (!this.documentModelsLoaded && this.parent.exists()) {
            return null;
        }

        const modelsCount =
            (this[MODELS_IN_SAME_DOCUMENT]?.length ?? 0) +
            (this[MODELS_IN_OTHER_DOCUMENT_IDS]?.length ?? 0) +
            (this[NEW_MODELS]?.length ?? 0) +
            (this.related?.length ?? 0);

        return modelsCount === 0;
    }

    public isRelated(related: Related): boolean {
        return !!this.related?.includes(related);
    }

    public addRelated(related: Related): void {
        if (this.isRelated(related)) {
            return;
        }

        this.related = (this.related ?? []).concat(related);

        if (!related.exists()) {
            this[NEW_MODELS] = (this[NEW_MODELS] ?? []).concat([related]);
        }
    }

    public abstract load(): Promise<Related[]>;
}
