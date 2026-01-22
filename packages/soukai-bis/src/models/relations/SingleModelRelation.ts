import { type Nullable, tap } from '@noeldemartin/utils';

import type Model from 'soukai-bis/models/Model';
import type { GetModelAttributes, ModelConstructor } from 'soukai-bis/models/types';

import Relation from './Relation';
import { SoukaiError } from 'soukai-bis/errors';
import { classMarker } from 'soukai-bis/models/relations/helpers';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public static [classMarker] = ['SingleModelRelation'];

    declare public __newModel?: Related;

    public get related(): Nullable<Related> {
        return this._related as Nullable<Related>;
    }

    public set related(related: Nullable<Related>) {
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
            if (this.loaded && this.related && !this.isRelated(model)) {
                throw new SoukaiError(
                    'The "attach" method can\'t be called because a related model already exists, ' +
                        'use a hasMany relationship if you want to support multiple related models.',
                );
            }

            this.setRelated(model);
            this.setForeignAttributes(model);
        });
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
