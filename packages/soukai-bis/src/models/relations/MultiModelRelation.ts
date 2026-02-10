import { tap } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import type { GetModelAttributes, ModelConstructor } from 'soukai-bis/models/types';

import Relation from './Relation';
import { classMarker } from './helpers';

export default abstract class MultiModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public static [classMarker] = ['MultiModelRelation'];

    declare public __newModels?: Related[];
    declare public __modelsInSameDocument?: Related[];
    declare public __modelsInOtherDocumentIds?: string[];

    public get related(): Nullable<Related[]> {
        return this._related as Nullable<Related[]>;
    }

    public set related(related: Nullable<Related[]>) {
        this._related = related;
    }

    public attach(model: Related): Related;
    public attach(attributes: GetModelAttributes<Related>): Related;
    public attach(modelOrAttributes: Related | GetModelAttributes<Related>): Related {
        const model =
            modelOrAttributes instanceof this.relatedClass
                ? (modelOrAttributes as Related)
                : this.relatedClass.newInstance(modelOrAttributes);

        return tap(model, () => {
            if (!this.assertLoaded('attach') || this.isRelated(model)) {
                return;
            }

            this.addRelated(model);
            this.setForeignAttributes(model);
        });
    }

    public async save(model: Related): Promise<Related> {
        this.assertLoaded('save');
        this.attach(model);

        if (!this.usingSameDocument) {
            await model.save();

            this.setForeignAttributes(model);
        } else if (this.parent.exists()) {
            await this.parent.save();
        }

        return model;
    }

    public async create(attributes: GetModelAttributes<Related>): Promise<Related> {
        return tap(this.attach(attributes), (model) => this.save(model));
    }

    public isEmpty(): boolean | null {
        if (!this.documentModelsLoaded && this.parent.exists()) {
            return null;
        }

        const modelsCount =
            (this.__modelsInSameDocument?.length ?? 0) +
            (this.__modelsInOtherDocumentIds?.length ?? 0) +
            (this.__newModels?.length ?? 0) +
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
            this.__newModels = (this.__newModels ?? []).concat([related]);
        }
    }

    public abstract load(): Promise<Related[]>;

    protected assertLoaded(method: string): this is { related: Related[] } {
        if (this.loaded) {
            return true;
        }

        if (!this.parent.exists() || this.isEmpty()) {
            this.related = [];

            return true;
        }

        throw new SoukaiError(`The "${method}" method can't be called before loading the relationship`);
    }

}
