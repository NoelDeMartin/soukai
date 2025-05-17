import { stringToCamelCase, tap } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';

import SoukaiError from 'soukai/errors/SoukaiError';
import { Relation } from 'soukai/models/relations/Relation';
import type { Attributes } from 'soukai/models/attributes';
import type { ModelConstructor } from 'soukai/models/inference';
import type { Model } from 'soukai/models/Model';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public constructor(parent: Parent, relatedClass: RelatedClass, foreignKeyName?: string, localKeyName?: string) {
        super(
            parent,
            relatedClass,
            foreignKeyName || stringToCamelCase(relatedClass.modelName + '_' + relatedClass.primaryKey),
            localKeyName,
        );
    }

    public get related(): Related | undefined | null {
        return this._related as Related | undefined | null;
    }

    public set related(related: Related | undefined | null) {
        const old = this.related;
        this._related = related;

        this.onRelatedUpdated(old, related);
    }

    public attach(model?: Related): Related;
    public attach(attributes: Attributes): Related;
    public attach(modelOrAttributes: Related | Attributes = {}): Related {
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

            this.addRelated(model);
            this.initializeInverseRelations(model);
            this.setForeignAttributes(model);
        });
    }

    public addRelated(related: Related): void {
        if (related === this.related) {
            return;
        }

        this.related = related;
    }

    public removeRelated(related: Related): void {
        if (related !== this.related) {
            return;
        }

        this.related = null;
    }

    public isRelated(related: Related): boolean {
        return related === this.related;
    }

    public abstract load(): Promise<Related | null>;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onRelatedUpdated(oldValue: Nullable<Model>, newValue: Nullable<Model>): void {
        //
    }

}
