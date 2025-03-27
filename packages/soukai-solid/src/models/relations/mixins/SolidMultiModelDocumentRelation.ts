import { arrayUnique, tap } from '@noeldemartin/utils';
import { MultiModelRelation } from 'soukai';
import type { Attributes, Key } from 'soukai';
import type { ClosureArgs } from '@noeldemartin/utils';

import { isSolidBelongsToRelation, isSolidHasRelation } from 'soukai-solid/models/relations/guards';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import SolidDocumentRelation from './SolidDocumentRelation';

// Workaround for https://github.com/microsoft/TypeScript/issues/16936
export type This<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = SolidMultiModelDocumentRelation<Parent, Related, RelatedClass> & MultiModelRelation<Parent, Related, RelatedClass>;

// Workaround for https://github.com/microsoft/TypeScript/issues/29132
export interface ProtectedSolidMultiRelation<Related extends SolidModel = SolidModel> {
    assertLoaded(method: string): this is { related: Related[] };
}

export type SolidMultiModelDocumentRelationInstance<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = This<Parent, Related, RelatedClass>;

export default class SolidMultiModelDocumentRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends SolidDocumentRelation<Related> {

    public __newModels: Related[] = [];
    public __removedDocumentModels: Related[] = [];
    declare public __modelsInSameDocument?: Related[];
    declare public __modelsInOtherDocumentIds?: string[];

    protected get protectedSolidMulti(): ProtectedSolidMultiRelation {
        return this as unknown as ProtectedSolidMultiRelation;
    }

    private get super(): MultiModelRelation {
        return new Proxy(this, {
            get: (target, property: keyof MultiModelRelation) => {
                return (...args: ClosureArgs) => MultiModelRelation.prototype[property].call(this, ...args);
            },
        }) as unknown as MultiModelRelation;
    }

    public isEmpty(this: This): boolean | null {
        if (!this.documentModelsLoaded && this.parent.exists()) return null;

        const modelsCount =
            (this.__modelsInSameDocument?.length || 0) +
            (this.__modelsInOtherDocumentIds?.length || 0) +
            this.__newModels.length +
            (this.related?.length || 0);

        return modelsCount === 0;
    }

    /**
     * This method will create an instance of the related model and call the [[save]] method.
     *
     * @param attributes Attributes to create the related instance.
     */
    public async create(this: This<Parent, Related, RelatedClass>, attributes: Attributes = {}): Promise<Related> {
        this.protectedSolidMulti.assertLoaded('create');

        const model = this.relatedClass.newInstance<Related>(attributes);

        await this.save(model);

        return model;
    }

    /**
     * This method will bind up all the relevant data (foreignKey, inverse relations, etc.) and save the model.
     * If the parent model does not exist and both models will be stored in the same document, the model will
     * be saved when the parent model is saved instead.
     *
     * @param model Related model instance to save.
     */
    public async save(this: This, model: Related): Promise<Related> {
        this.protectedSolidMulti.assertLoaded('save');
        this.attach(model);

        if (!this.useSameDocument || usingExperimentalActivityPods()) {
            await model.save();

            this.setForeignAttributes(model);
        } else if (this.parent.exists()) {
            await this.parent.save();
        }

        return model;
    }

    public async remove(this: This<Parent, Related, RelatedClass>, keyOrModel: string | Related): Promise<void> {
        this.detach(keyOrModel);

        await this.parent.save();
    }

    public detach(this: This<Parent, Related, RelatedClass>, keyOrModel: string | Related): void {
        const localKey = typeof keyOrModel === 'string' ? keyOrModel : keyOrModel.getAttribute(this.localKeyName);
        const detachedModel = this.related?.find((model) => model.getAttribute(this.localKeyName) === localKey);

        if (!detachedModel) {
            return;
        }

        this.related = this.related?.filter((model) => model.getAttribute(this.localKeyName) !== localKey);
        this.__newModels = this.__newModels.filter((model) => model.getAttribute(this.localKeyName) !== localKey);
        this.__modelsInSameDocument = this.__modelsInSameDocument?.filter(
            (model) => model.getAttribute(this.localKeyName) !== localKey,
        );
        this.__modelsInOtherDocumentIds = this.__modelsInOtherDocumentIds?.filter((id) => id !== localKey);

        if (detachedModel.getDocumentUrl() === this.parent.getDocumentUrl() && !this.parent.tracksHistory()) {
            this.__removedDocumentModels.push(detachedModel);
        }

        if (isSolidHasRelation(this)) {
            detachedModel.setAttribute(this.foreignKeyName, null);
        }

        if (isSolidBelongsToRelation(this)) {
            this.parent.setAttribute(
                this.foreignKeyName,
                this.parent.getAttribute<Key[]>(this.foreignKeyName).filter((key) => key !== localKey),
            );
        }
    }

    public addRelated(related: Related): void {
        this.super.addRelated(related);

        if (!related.exists()) {
            this.__newModels.push(related);
        }
    }

    public isRelated(model: Related): boolean {
        return this.super.isRelated(model) || this.__newModels.includes(model);
    }

    protected cloneSolidData(clone: This<Parent, Related, RelatedClass>): void {
        const relatedClones = clone.related ?? [];

        clone.useSameDocument = this.useSameDocument;
        clone.documentModelsLoaded = this.documentModelsLoaded;
        clone.__newModels = [];
        clone.__removedDocumentModels = [];

        for (const relatedModel of this.__newModels) {
            clone.__newModels.push(
                relatedClones.find((relatedClone) => relatedClone.is(relatedModel)) ??
                    tap(relatedModel.clone(), (relatedClone) => relatedClones.push(relatedClone)),
            );
        }

        for (const removedModel of this.__removedDocumentModels) {
            clone.__removedDocumentModels.push(
                relatedClones.find((relatedClone) => relatedClone.is(removedModel)) ??
                    tap(removedModel.clone(), (relatedClone) => relatedClones.push(relatedClone)),
            );
        }

        if (this.__modelsInSameDocument)
            clone.__modelsInSameDocument = this.__modelsInSameDocument.map((relatedModel) => {
                return relatedClones.find((relatedClone) => relatedClone.is(relatedModel)) ?? relatedModel.clone();
            });

        if (this.__modelsInOtherDocumentIds) clone.__modelsInOtherDocumentIds = this.__modelsInOtherDocumentIds;
    }

    protected loadDocumentModels(
        this: This<Parent, Related, RelatedClass>,
        modelsInSameDocument: Related[],
        modelsInOtherDocumentIds: string[],
    ): void {
        this.__modelsInSameDocument = modelsInSameDocument;
        this.__modelsInOtherDocumentIds = modelsInOtherDocumentIds;

        if (this.__modelsInOtherDocumentIds.length === 0)
            this.related = arrayUnique([...(this.related ?? []), ...this.__modelsInSameDocument]);

        this.documentModelsLoaded = true;
    }

}
