import { HasManyRelation } from 'soukai';
import { mixedWithoutTypes, tap } from '@noeldemartin/utils';
import type { RelationCloneOptions } from 'soukai';

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
        if (this.isEmpty()) return (this.related = []);

        if (!this.__modelsInSameDocument || !this.__modelsInOtherDocumentIds)
            // Solid hasMany relation only finds related models that have been
            // declared in the same document.
            return (this.related = []);

        const modelsInOtherDocuments = await this.loadRelatedModels(this.__modelsInOtherDocumentIds);

        this.related = [...this.__modelsInSameDocument, ...modelsInOtherDocuments];

        return this.related;
    }

    public reset(related: Related[] = []): void {
        this.related = [];
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

    protected loadRelatedModels(documentIds: string[]): Promise<Related[]> {
        return this.relatedClass.all<Related>({ $in: documentIds });
    }

}
