import { EngineHelper } from 'soukai';
import { urlRoute } from '@noeldemartin/utils';
import type { EngineDocument, EngineDocumentsCollection, Relation } from 'soukai';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';

import RDFDocument from 'soukai-solid/solid/RDFDocument';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import type SolidDocumentRelation from './SolidDocumentRelation';

// Workaround for https://github.com/microsoft/TypeScript/issues/16936
export type This<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = SolidBelongsToRelation & Relation<Parent, Related, RelatedClass>;

// Workaround for https://github.com/microsoft/TypeScript/issues/29132
export interface ProtectedSolidBelongsToRelation<Related extends SolidModel = SolidModel> {
    loadDocumentModels: SolidDocumentRelation<Related>['loadDocumentModels'];
}

export default class SolidBelongsToRelation {

    protected get protectedSolidBelongsTo(): ProtectedSolidBelongsToRelation {
        return this as unknown as ProtectedSolidBelongsToRelation;
    }

    public async __loadDocumentModels(this: This, documentUrl: string, document: JsonLDGraph): Promise<void> {
        const helper = new EngineHelper();
        const foreignKeyValue = this.parent.getAttribute(this.foreignKeyName);
        const modelIds = Array.isArray(foreignKeyValue) ? foreignKeyValue : foreignKeyValue ? [foreignKeyValue] : [];
        const filters = this.relatedClass.prepareEngineFilters();
        const reducedDocument = RDFDocument.reduceJsonLDGraph(document, this.parent.url) as EngineDocument;
        const documents = document['@graph']
            .filter((resource) => modelIds.indexOf(resource['@id']) !== -1)
            .reduce((docs, resource) => {
                docs[resource['@id']] = { '@graph': [resource as EngineDocument] };

                return docs;
            }, {} as EngineDocumentsCollection);

        const modelsInSameDocument = await Promise.all(
            Object.keys(helper.filterDocuments(documents, filters)).map((id) =>
                this.relatedClass.createFromEngineDocument(documentUrl, reducedDocument, id)),
        );

        const modelsInOtherDocumentIds = modelIds.filter(
            (resourceId) =>
                !modelsInSameDocument.some((model) => model.url === resourceId) && urlRoute(resourceId) !== documentUrl,
        );

        this.protectedSolidBelongsTo.loadDocumentModels(modelsInSameDocument, modelsInOtherDocumentIds);
    }

}
