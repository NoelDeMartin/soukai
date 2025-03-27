import { arrayFilter, arrayFrom, urlRoute } from '@noeldemartin/utils';
import type { Attributes, EngineDocument } from 'soukai';

import JsonLDModelSerializer from 'soukai-solid/models/internals/JsonLDModelSerializer';
import RDF from 'soukai-solid/solid/utils/RDF';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import { operationClass, operationClasses } from 'soukai-solid/models/history/operations';
import type AddPropertyOperation from 'soukai-solid/models/history/AddPropertyOperation';
import type DeleteOperation from 'soukai-solid/models/history/DeleteOperation';
import type Operation from 'soukai-solid/models/history/Operation';
import type RemovePropertyOperation from 'soukai-solid/models/history/RemovePropertyOperation';
import type SetPropertyOperation from 'soukai-solid/models/history/SetPropertyOperation';
import type UnsetPropertyOperation from 'soukai-solid/models/history/UnsetPropertyOperation';
import type { JsonLD, JsonLDGraph } from '@noeldemartin/solid-utils';
import type { Operations } from 'soukai-solid/models/history/operations';
import type { SolidBootedFieldsDefinition } from 'soukai-solid/models/fields';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

import SolidHasManyRelation from './SolidHasManyRelation';

interface OperationRdfsMatcher {
    operation: typeof Operation;

    match(resourceRdfsClasses: string[]): boolean;
}

export default class OperationsRelation<Parent extends SolidModel = SolidModel> extends SolidHasManyRelation<
    Parent,
    Operation,
    typeof Operation
> {

    private static operationMatchers: OperationRdfsMatcher[];

    constructor(parent: Parent) {
        super(parent, operationClass('Operation'), 'resourceUrl');
    }

    public attach(modelOrAttributes?: Operation | Attributes): Operation;
    public attach<T extends keyof Operations>(attributes: Attributes, type: T): InstanceType<Operations[T]>;
    public attach(modelOrAttributes: Operation | Attributes = {}, type?: keyof Operations): Operation {
        const Operation = operationClass('Operation');
        const model =
            modelOrAttributes instanceof Operation
                ? modelOrAttributes
                : operationClass(type ?? 'SetPropertyOperation').newInstance(modelOrAttributes);

        if (model.constructor === Operation) {
            throw new Error(
                'Creating base operations is meaningless, you should create a specific operation instead ' +
                    '(add property, remove property, etc.)',
            );
        }

        return super.attach(model);
    }

    public attachAddOperation(attributes: Attributes): AddPropertyOperation {
        return this.attach(attributes, 'AddPropertyOperation');
    }

    public attachRemoveOperation(attributes: Attributes): RemovePropertyOperation {
        return this.attach(attributes, 'RemovePropertyOperation');
    }

    public attachSetOperation(attributes: Attributes): SetPropertyOperation {
        return this.attach(attributes, 'SetPropertyOperation');
    }

    public attachUnsetOperation(attributes: Attributes): UnsetPropertyOperation {
        return this.attach(attributes, 'UnsetPropertyOperation');
    }

    public attachDeleteOperation(attributes: Attributes): DeleteOperation {
        return this.attach(attributes, 'DeleteOperation');
    }

    public async __loadDocumentModels(documentUrl: string, document: JsonLDGraph): Promise<void> {
        const foreignFields = this.relatedClass.fields as unknown as SolidBootedFieldsDefinition;
        const foreignProperty = foreignFields[this.foreignKeyName]?.rdfProperty as string;
        const reducedDocument = RDFDocument.reduceJsonLDGraph(document, this.parent.url) as EngineDocument;
        const resources = document['@graph'].filter((resource) => {
            const property = RDF.getJsonLDProperty(resource, foreignProperty);

            return (
                typeof property === 'object' &&
                property !== null &&
                '@id' in property &&
                (property as { '@id': string })['@id'] === this.parent.url
            );
        });
        const modelsInSameDocument = arrayFilter(
            await Promise.all(
                resources.map(async (resource) =>
                    this.getOperationClass(resource)?.createFromEngineDocument(
                        documentUrl,
                        reducedDocument,
                        resource['@id'],
                    )),
            ),
        );
        const modelsInOtherDocumentIds = resources
            .map((resource) => resource['@id'])
            .filter(
                (resourceId) =>
                    !modelsInSameDocument.some((model) => model.url === resourceId) &&
                    urlRoute(resourceId) !== documentUrl,
            );

        this.protectedSolidHas.loadDocumentModels(modelsInSameDocument, modelsInOtherDocumentIds);
    }

    protected async loadRelatedModels(): Promise<Operation[]> {
        throw new Error('loading operations from different documents has not been implemented yet');
    }

    protected getOperationClass(resource: JsonLD): typeof Operation | undefined {
        const matchers = this.getOperationMatchers();
        const resourceRdfsClasses = arrayFrom(resource['@type'] ?? []);
        const matcher = matchers.find((_matcher) => _matcher.match(resourceRdfsClasses));

        return matcher?.operation;
    }

    private getOperationMatchers(): OperationRdfsMatcher[] {
        return (OperationsRelation.operationMatchers ??= Object.values(operationClasses()).map((operation) => {
            const serializer = JsonLDModelSerializer.forModel(operation);
            const expandedTypes = operation.rdfsClasses;
            const compactedTypes = expandedTypes.map((rdfClass) => serializer.processExpandedIRI(rdfClass));
            const rdfsClasses = [...expandedTypes, ...compactedTypes];

            return {
                operation,
                match: (resourceRdfsClasses) =>
                    rdfsClasses.some((operationRdfsClass) => resourceRdfsClasses.includes(operationRdfsClass)),
            };
        }));
    }

}
