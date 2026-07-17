import { type Nullable, tap, uuid } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import Relation from './Relation';
import { classMarker } from './helpers';
import type { GetRelatedModelInput } from './types';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
    ForeignKeyName extends keyof GetModelInput<RelatedClass> = keyof GetModelInput<RelatedClass>,
> extends Relation<Parent, Related, RelatedClass, ForeignKeyName> {

    public static [classMarker] = ['SingleModelRelation'];

    declare public __newModel?: Related;
    declare public __modelInSameDocument?: Related;
    declare public __modelInOtherDocumentId?: string;

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
        options?: { mintUrl?: boolean }
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
            this.setInverseRelations(model);
            this.setForeignAttributes(model);
        });
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

        return !(this.__modelInSameDocument || this.__modelInOtherDocumentId || this.__newModel || this.related);
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
            this.__newModel = related;
        }
    }

    public abstract load(): Promise<Related | null>;

}
