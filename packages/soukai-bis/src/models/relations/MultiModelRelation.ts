import { tap, uuid } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import { emitModelInstanceEvent } from 'soukai-bis/models/events';
import { canonicalModel } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import { CLASS_MARKER, MODELS_IN_OTHER_DOCUMENT_IDS, MODELS_IN_SAME_DOCUMENT, NEW_MODELS } from './internals';
import Relation from './Relation';
import type { DetachOptions, RelationLoadOptions } from './Relation';
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
        this._related = related && related.map(canonicalModel);

        for (const model of this._related ?? []) {
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
                        : { containerUrl: this.resolveRelatedContainerUrl() ?? this.parent.url },
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

        const detachedModels = this.forgetRelated(related);

        for (const model of detachedModels) {
            this.detachModel(model, options);
        }

        return detachedModels;
    }

    public async delete(related: Related | Related[]): Promise<void> {
        this.assertLoaded('delete');

        const relatedModels = (Array.isArray(related) ? related : [related]).filter((model) => this.isRelated(model));
        const softDeletedModels = relatedModels.filter((model) => this.softDeletes(model));
        const deletedModels = relatedModels.filter((model) => !softDeletedModels.includes(model));

        for (const model of softDeletedModels) {
            await model.softDelete();

            this.forgetRelated(model);
        }

        if (deletedModels.length === 0 && softDeletedModels.length > 0) {
            await emitModelInstanceEvent(this.parent, 'updated');

            return;
        }

        await this.deleteDetachedModels(this.detach(deletedModels, { delete: true }));
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
        return !!this.related?.includes(canonicalModel(related));
    }

    public addRelated(related: Related): void {
        if (this.isRelated(related)) {
            return;
        }

        const model = canonicalModel(related);

        this.related = (this.related ?? []).concat(model);

        if (!model.exists()) {
            this[NEW_MODELS] = (this[NEW_MODELS] ?? []).concat([model]);
        }
    }

    public abstract load(options?: RelationLoadOptions): Promise<Related[]>;

    protected assertLoaded(method: string): asserts this is { related: Related[] } {
        super.assertLoaded(method);
    }

    protected initializeEmptyRelation(): void {
        this.related = [];
    }

    protected forgetRelated(related: Related | Related[]): Related[] {
        const forgottenModels = (Array.isArray(related) ? related : [related])
            .filter((model) => this.isRelated(model))
            .map(canonicalModel);

        if (forgottenModels.length === 0) {
            return [];
        }

        const forgottenUrls = forgottenModels.map((model) => model.url);
        const isForgotten = (model: Related) => forgottenModels.includes(model);

        this.related = this.related?.filter((model) => !isForgotten(model)) ?? null;
        this[NEW_MODELS] = this[NEW_MODELS]?.filter((model) => !isForgotten(model));
        this[MODELS_IN_SAME_DOCUMENT] = this[MODELS_IN_SAME_DOCUMENT]?.filter((model) => !isForgotten(model));
        this[MODELS_IN_OTHER_DOCUMENT_IDS] = this[MODELS_IN_OTHER_DOCUMENT_IDS]?.filter(
            (url) => !forgottenUrls.includes(url),
        );

        return forgottenModels;
    }
}
