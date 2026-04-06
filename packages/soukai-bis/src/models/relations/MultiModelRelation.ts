import { tap } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';

import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

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
    public attach(attributes: GetModelInput<RelatedClass>): Related;
    public attach(modelOrAttributes: Related | GetModelInput<RelatedClass>): Related {
        const model =
            modelOrAttributes instanceof this.relatedClass
                ? (modelOrAttributes as Related)
                : this.relatedClass.newInstance(modelOrAttributes);

        return tap(model, () => {
            if (!this.assertLoaded('attach') || this.isRelated(model)) {
                return;
            }

            this.addRelated(model);
            this.setInverseRelations(model);
            this.setForeignAttributes(model);
        });
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

}
