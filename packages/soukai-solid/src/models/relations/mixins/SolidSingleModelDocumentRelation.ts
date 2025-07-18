import { SingleModelRelation, SoukaiError } from 'soukai';
import { overridePrototypeMethod, tap } from '@noeldemartin/utils';
import type { Attributes, Model } from 'soukai';
import type { ClosureArgs, Nullable } from '@noeldemartin/utils';

import { bustWeakMemoModelCache } from 'soukai-solid/models/utils';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type { SolidModel, SynchronizeCloneOptions } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import SolidDocumentRelation from './SolidDocumentRelation';

// Workaround for https://github.com/microsoft/TypeScript/issues/16936
export type This<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = SolidSingleModelDocumentRelation<Parent, Related, RelatedClass> &
    SingleModelRelation<Parent, Related, RelatedClass>;

export type SolidSingleModelDocumentRelationInstance<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = This<Parent, Related, RelatedClass>;

export default class SolidSingleModelDocumentRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends SolidDocumentRelation<Related> {

    declare public __modelInSameDocument?: Related;
    declare public __modelInOtherDocumentId?: string;
    declare private __newModelValue?: Related;

    private get super(): SingleModelRelation {
        return new Proxy(this, {
            get: (target, property: keyof SingleModelRelation) => {
                return (...args: ClosureArgs) => SingleModelRelation.prototype[property].call(this, ...args);
            },
        }) as unknown as SingleModelRelation;
    }

    public get __newModel(): Related | undefined {
        return this.__newModelValue;
    }

    public set __newModel(value: Related | undefined) {
        bustWeakMemoModelCache((this as unknown as This).parent);
        bustWeakMemoModelCache(this.__newModelValue);
        bustWeakMemoModelCache(value);

        this.__newModelValue = value;
    }

    public isEmpty(this: This): boolean | null {
        if (!this.documentModelsLoaded && this.parent.exists()) return null;

        return !(this.__modelInSameDocument || this.__modelInOtherDocumentId || this.__newModel || this.related);
    }

    /**
     * This method will create an instance of the related model and call the [[save]] method.
     *
     * @param attributes Attributes to create the related instance.
     */
    public async create(this: This<Parent, Related, RelatedClass>, attributes: Attributes = {}): Promise<Related> {
        this.assertNotLoadedOrEmpty('create');

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
        this.assertNotLoadedOrEmpty('save');
        this.attach(model);

        if (!this.useSameDocument || usingExperimentalActivityPods()) {
            await model.save();
        } else if (this.parent.exists()) {
            await this.parent.save();
        }

        return model;
    }

    public addRelated(this: This, related: Related): void {
        if (this.related === related) {
            return;
        }

        this.super.addRelated(related);

        if (!related.exists()) {
            this.__newModel = related;
        }
    }

    public isRelated(related: Related): boolean {
        return this.super.isRelated(related) || this.__newModel === related;
    }

    protected cloneSolidData(
        this: This<Parent, Related, RelatedClass>,
        clone: This<Parent, Related, RelatedClass>,
    ): void {
        let relatedClone = clone.related ?? (null as Related | null);

        clone.useSameDocument = this.useSameDocument;
        clone.documentModelsLoaded = this.documentModelsLoaded;

        if (this.__newModel) {
            this.__newModel = relatedClone ?? tap(this.__newModel.clone(), (rClone) => (relatedClone = rClone));
        }

        if (this.__modelInSameDocument) {
            clone.__modelInSameDocument = relatedClone ?? this.__modelInSameDocument.clone();
        }

        if (this.__modelInOtherDocumentId) {
            clone.__modelInOtherDocumentId = this.__modelInOtherDocumentId;
        }
    }

    protected loadDocumentModels(
        this: This<Parent, Related, RelatedClass>,
        modelsInSameDocument: Related[],
        modelsInOtherDocumentIds: string[],
    ): void {
        if (modelsInSameDocument.length + modelsInOtherDocumentIds.length > 1)
            // eslint-disable-next-line no-console
            console.warn(
                `The ${this.name} relationship in ${this.parent.static('modelName')} has been declared as hasOne, ` +
                    'but more than one related model were found.',
            );

        if (modelsInSameDocument.length > 0) {
            this.__modelInSameDocument = modelsInSameDocument[0];
            this.documentModelsLoaded = true;

            this.related = this.__modelInSameDocument;

            if (!this.__modelInSameDocument?.exists()) {
                this.__newModel = this.__modelInSameDocument;

                return;
            }

            this.__newModel = undefined;

            return;
        }

        if (modelsInOtherDocumentIds.length > 0) {
            this.__modelInOtherDocumentId = modelsInOtherDocumentIds[0];
            this.documentModelsLoaded = true;

            return;
        }

        this.documentModelsLoaded = true;
    }

    protected async __synchronizeRelated(
        this: This<Parent, Related, RelatedClass>,
        other: This<Parent, Related, RelatedClass>,
        options: { models: WeakSet<SolidModel> } & SynchronizeCloneOptions,
    ): Promise<void> {
        const { models, ...cloneOptions } = options;

        if (!this.related && other.related) {
            this.related = other.related.clone({
                clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
                ...cloneOptions,
            });

            return;
        }

        if (!other.related || !this.related) {
            return;
        }

        const foreignKey = this.parent.getAttribute(this.foreignKeyName);

        await this.related.static().synchronize(this.related, other.related, {
            __models: models,
            ...cloneOptions,
        });

        if (this.__newModel || this.related.url === foreignKey) {
            this.related = this.__newModel ?? this.related;

            return;
        }

        if (other.related.url === foreignKey) {
            this.related = other.related.clone({
                clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
                ...cloneOptions,
            });
        }
    }

    private assertNotLoadedOrEmpty(this: This, method: string): void {
        if (!this.loaded || !this.related) {
            return;
        }

        throw new SoukaiError(
            `The "${method}" method can't be called because a related model already exists, ` +
                'use a hasMany relationship if you want to support multiple related models.',
        );
    }

}

// This is necessary because otherwise, Typescript gives an error when this is extended,
// for example in SolidHasOneRelation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
overridePrototypeMethod<any, string>(
    SolidSingleModelDocumentRelation,
    'onRelatedUpdated',
    function(this: This, oldValue: Nullable<SolidModel>, newValue: Nullable<SolidModel>): void {
        if (this !== this.parent.requireRelation(this.name)) {
            return;
        }

        bustWeakMemoModelCache(this.parent);
        bustWeakMemoModelCache(oldValue);
        bustWeakMemoModelCache(newValue);

        oldValue && this.clearInverseRelations(oldValue);
        newValue && this.initializeInverseRelations(newValue);
    },
);
