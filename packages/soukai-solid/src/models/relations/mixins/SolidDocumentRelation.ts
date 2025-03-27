import type { Relation } from 'soukai';

import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';
import type { DocumentContainsRelation } from 'soukai-solid/models/relations/DocumentContainsRelation';

// Workaround for https://github.com/microsoft/TypeScript/issues/35356
export interface ISolidDocumentRelation<Related extends SolidModel = SolidModel> extends DocumentContainsRelation {
    reset(related?: Related[]): void;
    __beforeParentCreate(): void;
}

export type SolidDocumentRelationInstance<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = Relation<Parent, Related, RelatedClass> & SolidDocumentRelation<Related> & ISolidDocumentRelation<Related>;

export default abstract class SolidDocumentRelation<Related extends SolidModel> {

    public useSameDocument: boolean = false;

    protected documentModelsLoaded: boolean = false;

    public usingSameDocument(useSameDocument: boolean = true): this {
        this.useSameDocument = useSameDocument;

        return this;
    }

    protected abstract loadDocumentModels(modelsInSameDocument: Related[], modelsInOtherDocumentIds: string[]): void;

}
