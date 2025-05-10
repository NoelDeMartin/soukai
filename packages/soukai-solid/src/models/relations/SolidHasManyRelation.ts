import { HasManyRelation } from 'soukai';
import { map, mixedWithoutTypes, tap } from '@noeldemartin/utils';
import type { Model, RelationCloneOptions } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import SolidHasRelation from './mixins/SolidHasRelation';
import SolidMultiModelDocumentRelation from './mixins/SolidMultiModelDocumentRelation';
import type { BeforeParentCreateRelation } from './guards';
import type { ISolidDocumentRelation } from './mixins/SolidDocumentRelation';

export const SolidHasManyRelationBase = mixedWithoutTypes(HasManyRelation, [
    SolidMultiModelDocumentRelation,
    SolidHasRelation,
]);

export default interface SolidHasManyRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends SolidMultiModelDocumentRelation<Parent, Related, RelatedClass>,
        SolidHasRelation {}
export default class SolidHasManyRelation<
        Parent extends SolidModel = SolidModel,
        Related extends SolidModel = SolidModel,
        RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
    >
    extends SolidHasManyRelationBase<Parent, Related, RelatedClass>
    implements ISolidDocumentRelation<Related>, BeforeParentCreateRelation
{

    public async load(): Promise<Related[]> {
        if (this.isEmpty()) {
            return this.setRelated([]);
        }

        if (!this.__modelsInSameDocument || !this.__modelsInOtherDocumentIds) {
            // Solid hasMany relation only finds related models that have been
            // declared in the same document.
            return this.setRelated([]);
        }

        const modelsInOtherDocuments = await this.loadRelatedModels(this.__modelsInOtherDocumentIds);

        return this.setRelated([...this.__modelsInSameDocument, ...modelsInOtherDocuments]);
    }

    public reset(related: Related[] = []): void {
        this.setRelated([]);

        this.__newModels = [];
        this.__modelsInSameDocument = [];

        related.forEach((model) => {
            model.unsetAttribute(this.foreignKeyName);

            this.related?.push(model);
            this.__newModels.push(model);
        });
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
        const thisRelatedMap = map(this.related ?? [], 'url');
        const otherRelatedMap = map(other.related ?? [], 'url');
        const missingInThis = otherRelatedMap.getItems().filter((model) => !thisRelatedMap.hasKey(model.url));
        const missingInOther = [];

        for (const thisRelated of thisRelatedMap.items()) {
            const otherRelated = otherRelatedMap.get(thisRelated.url);

            if (!otherRelated) {
                missingInOther.push(thisRelated);

                continue;
            }

            await thisRelated.static().synchronize(thisRelated, otherRelated, models);
        }

        this.setRelated([
            ...thisRelatedMap.items(),
            ...missingInThis.map((model) =>
                model.clone({
                    clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
                })),
        ]);

        other.setRelated([
            ...otherRelatedMap.items(),
            ...missingInOther.map((model) =>
                model.clone({
                    clones: tap(new WeakMap<Model, Model>(), (clones) => clones.set(other.parent, this.parent)),
                })),
        ]);
    }

    protected loadRelatedModels(documentIds: string[]): Promise<Related[]> {
        return this.relatedClass.all<Related>({ $in: documentIds });
    }

}
