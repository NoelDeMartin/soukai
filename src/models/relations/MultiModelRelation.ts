import { arrayUnique, stringToCamelCase, tap } from '@noeldemartin/utils';

import SoukaiError from 'soukai/errors/SoukaiError';
import { Relation } from 'soukai/models/relations/Relation';
import type { Attributes } from 'soukai/models/attributes';
import type { ModelConstructor } from 'soukai/models/inference';
import type { Model } from 'soukai/models/Model';

export default abstract class MultiModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    declare public related?: Related[];

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    ) {
        super(
            parent,
            relatedClass,
            foreignKeyName || stringToCamelCase(relatedClass.name + '_' + relatedClass.primaryKey + 's'),
            localKeyName,
        );
    }

    public attach(model?: Related): Related;
    public attach(attributes: Attributes): Related;
    public attach(modelOrAttributes: Related | Attributes = {}): Related {
        const model = modelOrAttributes instanceof this.relatedClass
            ? modelOrAttributes as Related
            : this.relatedClass.newInstance(modelOrAttributes);

        return tap(model, () => {
            if (!this.assertLoaded('attach') || this.isRelated(model)) {
                return;
            }

            this.addRelated(model);
            this.initializeInverseRelations(model);
            this.setForeignAttributes(model);
        });
    }

    public addRelated(related: Related): void {
        this.related = arrayUnique([
            ...this.related ?? [],
            related,
        ]);
    }

    public abstract load(): Promise<Related[]>;

    public isRelated(model: Related): boolean {
        return !!this.related?.includes(model);
    }

    protected assertLoaded(method: string): this is { related: Related[] } {
        if (this.loaded) {
            return true;
        }

        if (!this.parent.exists()) {
            this.related = [];

            return true;
        }

        throw new SoukaiError(`The "${method}" method can't be called before loading the relationship`);
    }

}
