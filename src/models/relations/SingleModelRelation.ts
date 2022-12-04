import { stringToCamelCase, tap } from '@noeldemartin/utils';

import SoukaiError from '@/errors/SoukaiError';
import { Relation } from '@/models/relations/Relation';
import type { Attributes } from '@/models/attributes';
import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    declare public related?: Related | null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    ) {
        super(
            parent,
            relatedClass,
            foreignKeyName || stringToCamelCase(relatedClass.name + '_' + relatedClass.primaryKey),
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
            if (this.loaded && !this.isRelated(model)) {
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
        this.related = related;
    }

    public isRelated(related: Related): boolean {
        return related === this.related;
    }

    public abstract load(): Promise<Related | null>;

}
