import { BelongsToOneRelation } from 'soukai';
import { mixedWithoutTypes, tap } from '@noeldemartin/utils';
import type { Model, RelationCloneOptions } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import SolidBelongsToRelation from './mixins/SolidBelongsToRelation';
import SolidSingleModelDocumentRelation from './mixins/SolidSingleModelDocumentRelation';
import type { BeforeParentCreateRelation, SynchronizesRelatedModels } from './guards';
import type { ISolidDocumentRelation } from './mixins/SolidDocumentRelation';

export const SolidBelongsToOneRelationBase = mixedWithoutTypes(BelongsToOneRelation, [
    SolidSingleModelDocumentRelation,
    SolidBelongsToRelation,
]);

export default interface SolidBelongsToOneRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends SolidSingleModelDocumentRelation<Parent, Related, RelatedClass>,
        SolidBelongsToRelation {}
export default class SolidBelongsToOneRelation<
        Parent extends SolidModel = SolidModel,
        Related extends SolidModel = SolidModel,
        RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
    >
    extends SolidBelongsToOneRelationBase<Parent, Related, RelatedClass>
    implements ISolidDocumentRelation<Related>, BeforeParentCreateRelation, SynchronizesRelatedModels
{

    public async load(): Promise<Related | null> {
        if (this.__modelInSameDocument) return (this.related = this.__modelInSameDocument);

        const foreignKey = this.__modelInOtherDocumentId ?? this.parent.getAttribute(this.foreignKeyName);

        if (!foreignKey) return (this.related = null);

        const related = await this.relatedClass.find(foreignKey);

        return (this.related = related);
    }

    public reset(related: Related[] = []): void {
        const model = related[0];

        delete this.related;
        delete this.__modelInSameDocument;
        delete this.__modelInSameDocument;

        if (!model) {
            return;
        }

        this.parent.unsetAttribute(this.foreignKeyName);

        this.related = model;
        this.__newModel = model;
    }

    public clone(options: RelationCloneOptions = {}): this {
        return tap(super.clone(options), (clone) => {
            this.cloneSolidData(clone);
        });
    }

    public __beforeParentCreate(): void {
        if (this.documentModelsLoaded) return;

        const foreignValue = this.parent.getAttribute<string>(this.foreignKeyName);

        this.loadDocumentModels([], foreignValue ? [foreignValue] : []);
    }

    public async __synchronizeRelated(other: this): Promise<void> {
        if (!this.related || !other.related || this.related.url !== other.related.url) {
            return;
        }

        const foreignKey = this.parent.getAttribute(this.foreignKeyName);

        await this.related.static().synchronize(this.related, other.related);

        if (this.__newModel || this.related.url === foreignKey) {
            this.related = this.__newModel ?? this.related;

            return;
        }

        if (other.related.url === foreignKey) {
            this.related = other.related.clone({
                clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
            });
        }
    }

}
