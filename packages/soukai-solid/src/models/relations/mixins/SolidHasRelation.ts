import { EngineHelper } from 'soukai';
import { urlRoute } from '@noeldemartin/utils';
import type { EngineDocument, EngineDocumentsCollection, Relation } from 'soukai';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';

import RDF from 'soukai-solid/solid/utils/RDF';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import type { SolidBootedFieldsDefinition } from 'soukai-solid/models/fields';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import type SolidDocumentRelation from './SolidDocumentRelation';

// Workaround for https://github.com/microsoft/TypeScript/issues/16936
export type This<
    Parent extends SolidModel = SolidModel,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> = SolidHasRelation & Relation<Parent, Related, RelatedClass>;

// Workaround for https://github.com/microsoft/TypeScript/issues/29132
export interface ProtectedSolidHasRelation<Related extends SolidModel = SolidModel> {
    loadDocumentModels: SolidDocumentRelation<Related>['loadDocumentModels'];
}

export default class SolidHasRelation {

    protected get protectedSolidHas(): ProtectedSolidHasRelation {
        return this as unknown as ProtectedSolidHasRelation;
    }

    public async __loadDocumentModels(this: This, documentUrl: string, document: JsonLDGraph): Promise<void> {
        const helper = new EngineHelper();
        const foreignFields = this.relatedClass.fields as SolidBootedFieldsDefinition;
        const foreignProperty = foreignFields[this.foreignKeyName]?.rdfProperty as string;
        const filters = this.relatedClass.prepareEngineFilters();
        const reducedDocument = RDFDocument.reduceJsonLDGraph(document, this.parent.url) as EngineDocument;
        const resourceDocuments = document['@graph']
            .filter((resource) => {
                const property = RDF.getJsonLDProperty(resource, foreignProperty);

                return (
                    typeof property === 'object' &&
                    property !== null &&
                    '@id' in property &&
                    (property as { '@id': string })['@id'] === this.parent.url
                );
            })
            .reduce((documents, resource) => {
                documents[resource['@id']] = { '@graph': [resource as EngineDocument] };

                return documents;
            }, {} as EngineDocumentsCollection);

        const modelsInSameDocument = await Promise.all(
            Object.keys(helper.filterDocuments(resourceDocuments, filters)).map((id) =>
                this.relatedClass.createFromEngineDocument(documentUrl, reducedDocument, id)),
        );

        const modelsInOtherDocumentIds = Object.keys(resourceDocuments).filter(
            (resourceId) =>
                !modelsInSameDocument.some((model) => model.url === resourceId) && urlRoute(resourceId) !== documentUrl,
        );

        this.protectedSolidHas.loadDocumentModels(modelsInSameDocument, modelsInOtherDocumentIds);
    }

}
