import { HasOneRelation } from 'soukai';
import { mixedWithoutTypes, tap } from '@noeldemartin/utils';
import type { Model, RelationCloneOptions } from 'soukai';

import SolidHasRelation from 'soukai-solid/models/relations/mixins/SolidHasRelation';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import SolidSingleModelDocumentRelation from './mixins/SolidSingleModelDocumentRelation';
import type { BeforeParentCreateRelation } from './guards';
import type { ISolidDocumentRelation } from './mixins/SolidDocumentRelation';

export const SolidHasOneRelationBase = mixedWithoutTypes(HasOneRelation, [
    SolidSingleModelDocumentRelation,
    SolidHasRelation,
]);

export default interface SolidHasOneRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends SolidSingleModelDocumentRelation<Parent, Related, RelatedClass>,
        SolidHasRelation {}
export default class SolidHasOneRelation<
        Parent extends SolidModel = SolidModel,
        Related extends SolidModel = SolidModel,
        RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
    >
    extends SolidHasOneRelationBase<Parent, Related, RelatedClass>
    implements ISolidDocumentRelation<Related>, BeforeParentCreateRelation
{

    public async load(): Promise<Related | null> {
        if (this.isEmpty()) {
            return this.setRelated(null);
        }

        if (!(this.__modelInSameDocument || this.__modelInOtherDocumentId)) {
            // Solid hasOne relation only finds related models that have been
            // declared in the same document.
            return this.setRelated(null);
        }

        const resolveModel = async (): Promise<Related | null> => {
            if (this.__modelInSameDocument) {
                return this.__modelInSameDocument;
            }

            if (this.__modelInOtherDocumentId) {
                return this.relatedClass.find(this.__modelInOtherDocumentId);
            }

            return null;
        };

        const model = await resolveModel();

        return this.setRelated(model);
    }

    public async remove(): Promise<void> {
        if (!this.related) {
            return;
        }

        const related = this.related;

        this.related = null;

        await related.delete();
    }

    public reset(related: Related[] = []): void {
        const model = related[0];

        delete this.related;
        delete this.__newModel;
        delete this.__modelInSameDocument;

        if (!model) {
            return;
        }

        model.unsetAttribute(this.foreignKeyName);

        this.setRelated(model);

        this.__newModel = model;
    }

    public clone(options: RelationCloneOptions = {}): this {
        return tap(super.clone(options), (clone) => {
            this.cloneSolidData(clone);
        });
    }

    public __beforeParentCreate(): void {
        if (this.documentModelsLoaded) return;

        this.loadDocumentModels([], []);
    }

    public async __synchronizeRelated(other: this, models: WeakSet<SolidModel>): Promise<void> {
        if (this.related && other.related && this.related.url === other.related.url) {
            await this.related.static().synchronize(this.related, other.related, models);

            return;
        }

        if (!other.related || (this.related && this.related.url !== other.related.url)) {
            return;
        }

        if (!this.related) {
            this.setRelated(
                other.related.clone({
                    clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
                }),
            );

            return;
        }
    }

}
