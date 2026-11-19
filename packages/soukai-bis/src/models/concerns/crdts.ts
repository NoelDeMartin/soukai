import { RDFNamedNode } from '@noeldemartin/solid-utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import { arrayFilter, arrayFrom, arrayUnique, invade, objectWithoutEmpty, required, tap } from '@noeldemartin/utils';
import type { Quad_Object } from '@rdfjs/types';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import { requireEngine } from 'soukai-bis/engines/state';
import {
    CRDT_ADD_PROPERTY_OPERATION_OBJECT,
    CRDT_DELETE_OPERATION_OBJECT,
    CRDT_DELETED_AT_PREDICATE,
    CRDT_REMOVE_PROPERTY_OPERATION_OBJECT,
    CRDT_RESOURCE_PREDICATE,
    CRDT_RESTORE_OPERATION_OBJECT,
    CRDT_SET_PROPERTY_OPERATION_OBJECT,
    CRDT_TOMBSTONE_OBJECT,
    CRDT_UNSET_PROPERTY_OPERATION_OBJECT,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/lib/internals/rdf';
import { getRDFIRIVariants } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import {
    createPropertyResetOperation,
    foldPropertyOperations,
    getPropertyOperationKey,
    isLifecycleOperation,
    isPropertyOperation,
    sortedOperations,
    valuesEqual,
} from 'soukai-bis/models/crdts/helpers';
import type LifecycleOperation from 'soukai-bis/models/crdts/LifecycleOperation';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import { findMetadataSubject } from 'soukai-bis/models/crdts/soft-deletes';
import type Tombstone from 'soukai-bis/models/crdts/Tombstone';
import { getFieldRDFProperties, getSchema } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import { isBootedModelInstance, requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import { castTermToJavaScript, castToRDF, isArrayField, isUrlField } from 'soukai-bis/zod/utils';
import type { ZodType } from 'zod';

function createInceptionOperations(model: Model, createdAt: Date): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const operations: Operation[] = [];
    const schema = getSchema(model.static());
    const originalAttributes = objectWithoutEmpty(model.getOriginalAttributes());
    const staleRDFProperties = invade(model, ['_staleRDFProperties'])._staleRDFProperties;

    delete originalAttributes.url;

    for (const [field, value] of Object.entries(originalAttributes)) {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
            continue;
        }

        const fieldDefinition = schema.fields.def.shape[field];

        if (!fieldDefinition) {
            continue;
        }

        const values = castToRDF(value, fieldDefinition);

        if (values.length === 0) {
            continue;
        }

        const isNamedNode = isUrlField(fieldDefinition);

        for (const property of getFieldRDFProperties(model.static(), field)) {
            if (staleRDFProperties?.has(property.value)) {
                continue;
            }

            const operation = new SetPropertyOperation({
                resourceUrl: model.requireUrl(),
                property: property.value,
                value: values.map(castTermToJavaScript),
                date: model.createdAt ?? createdAt,
            });

            operations.push(operation.setPredicate(property).setNamedNode(isNamedNode).setValues(values));
        }
    }

    return operations;
}

function rewriteRDFPrefixAliases(
    model: Model,
    inceptionOperations: Operation[],
    documentOperations: Operation[],
): void {
    const rdfPrefixAliases = invade(model, ['_rdfPrefixAliases'])._rdfPrefixAliases;

    if (!rdfPrefixAliases || rdfPrefixAliases.properties.size === 0) {
        return;
    }

    const updatedProperties = new Set(
        documentOperations.filter(isPropertyOperation).map((operation) => operation.property),
    );

    for (const operation of inceptionOperations) {
        if (
            !isPropertyOperation(operation) ||
            !rdfPrefixAliases.properties.has(operation.property) ||
            updatedProperties.has(operation.property)
        ) {
            continue;
        }

        documentOperations.push(operation);
        rdfPrefixAliases.properties.delete(operation.property);
    }

    if (!rdfPrefixAliases.classes && rdfPrefixAliases.properties.size === 0) {
        invade(model, ['_rdfPrefixAliases'])._rdfPrefixAliases = null;
    }
}

function usesArrayPropertyOperations(model: Model, field: string, fieldDefinition: ZodType): boolean {
    if (!model.exists() || !model.tracksChanges() || !isArrayField(fieldDefinition)) {
        return false;
    }

    return !hasPropertiesStoredUnderRDFPrefixAliases(model, field);
}

function hasPropertiesStoredUnderRDFPrefixAliases(model: Model, field: string): boolean {
    const rdfPrefixAliases = invade(model, ['_rdfPrefixAliases'])._rdfPrefixAliases;

    return getFieldRDFProperties(model.static(), field).some((property) =>
        rdfPrefixAliases?.properties.has(property.value),
    );
}

function createArrayPropertyOperations(
    model: ModelWithUrl,
    field: string,
    fieldDefinition: ZodType,
    date: Date,
): PropertyOperation[] {
    const AddPropertyOperation = requireBootedModel('AddPropertyOperation');
    const RemovePropertyOperation = requireBootedModel('RemovePropertyOperation');
    const castTerms = (value: unknown) => {
        const terms: Quad_Object[] = [];

        for (const term of castToRDF(arrayFrom(value, { ignoreEmptyValues: true }), fieldDefinition)) {
            if (includesTerm(terms, term)) {
                continue;
            }

            terms.push(term);
        }

        return terms;
    };
    const includesTerm = (terms: Quad_Object[], term: Quad_Object) => terms.some((otherTerm) => otherTerm.equals(term));
    const originalTerms = castTerms(model.getOriginalAttribute(field));
    const terms = castTerms(model.getAttribute(field));
    const added = terms.filter((term) => !includesTerm(originalTerms, term));
    const removed = originalTerms.filter((term) => !includesTerm(terms, term));
    const isNamedNode = isUrlField(fieldDefinition);
    const operations: PropertyOperation[] = [];

    for (const property of getFieldRDFProperties(model.static(), field)) {
        const attributes = { resourceUrl: model.url, property: property.value, date };

        added.length > 0 &&
            operations.push(
                new AddPropertyOperation({ ...attributes, value: added.map(castTermToJavaScript) })
                    .setNamedNode(isNamedNode)
                    .setValues(added)
                    .setPredicate(property),
            );

        removed.length > 0 &&
            operations.push(
                new RemovePropertyOperation({ ...attributes, value: removed.map(castTermToJavaScript) })
                    .setNamedNode(isNamedNode)
                    .setValues(removed)
                    .setPredicate(property),
            );
    }

    return operations;
}

export function getDirtyDocumentsUpdates({
    updatedModels,
    restoredModels = [],
    newOperations,
    date,
}: {
    updatedModels: Model[];
    restoredModels?: Model[];
    newOperations?: Map<string, string[]>;
    date?: Date;
}): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const UnsetPropertyOperation = requireBootedModel('UnsetPropertyOperation');
    const now = date ?? new Date();
    const operations: Record<string, Operation[]> = {};

    for (const model of updatedModels) {
        if (!model.url) {
            continue;
        }

        const exists = model.exists();
        const restored = restoredModels.includes(model);
        const schema = getSchema(model.static());
        const attributes = model.getAttributes();
        const modelOperations = (operations[model.url] ??= []);
        const updatedAttributes = restored
            ? arrayUnique([...model.getDirtyAttributes(), ...Object.keys(schema.fields.def.shape)])
            : model.getDirtyAttributes();

        exists ||
            modelOperations.push(
                new SetPropertyOperation({
                    resourceUrl: model.url,
                    property: RDF_TYPE_PREDICATE.value,
                    value: model.static().getRDFClasses(),
                    date: model.updatedAt ?? now,
                })
                    .setNamedNode(true)
                    .setPredicate(RDF_TYPE_PREDICATE),
            );

        for (const attribute of updatedAttributes) {
            const value = attributes[attribute];
            const fieldDefinition = schema.fields.def.shape[attribute];

            if (!fieldDefinition) {
                continue;
            }

            if (usesArrayPropertyOperations(model, attribute, fieldDefinition)) {
                modelOperations.push(
                    ...createArrayPropertyOperations(
                        model as ModelWithUrl,
                        attribute,
                        fieldDefinition,
                        model.updatedAt ?? now,
                    ),
                );

                continue;
            }

            const isNamedNode = isUrlField(fieldDefinition);
            const values =
                value === undefined || value === null || (Array.isArray(value) && value.length === 0)
                    ? []
                    : castToRDF(value, fieldDefinition);

            for (const property of getFieldRDFProperties(model.static(), attribute)) {
                if (values.length === 0) {
                    (exists || restored) &&
                        modelOperations.push(
                            new UnsetPropertyOperation({
                                resourceUrl: model.url,
                                property: property.value,
                                date: model.updatedAt ?? now,
                            }).setPredicate(property),
                        );

                    continue;
                }

                const operation = new SetPropertyOperation({
                    resourceUrl: model.url,
                    property: property.value,
                    value: values.map(castTermToJavaScript),
                    date: model.updatedAt ?? now,
                });

                modelOperations.push(operation.setPredicate(property).setNamedNode(isNamedNode).setValues(values));
            }
        }
    }

    for (const model of updatedModels) {
        const restored = restoredModels.includes(model);

        if (!model.url || !model.tracksChanges() || (!model.exists() && !restored)) {
            continue;
        }

        const updateOperations = new Array<Operation>().concat(operations[model.url] ?? []);
        const crdtOperations = [...updateOperations];

        if (!restored && (!model.operations || model.operations.length === 0)) {
            const inceptionOperations = createInceptionOperations(model, now);

            crdtOperations.push(...inceptionOperations);
            rewriteRDFPrefixAliases(model, inceptionOperations, (operations[model.url] ??= []));
        }

        const pendingSoftDeletion = model.getPendingSoftDeletion();

        if (pendingSoftDeletion) {
            const LifecycleOperationModel = requireBootedModel(
                pendingSoftDeletion === 'soft-delete' ? 'DeleteOperation' : 'RestoreOperation',
            );
            const lifecycleOperation = new LifecycleOperationModel({
                resourceUrl: model.url,
                date: model.updatedAt ?? now,
            });

            lifecycleOperation.setMetadataSubject(model.metadata?.url ? new RDFNamedNode(model.metadata.url) : null);
            crdtOperations.push(lifecycleOperation);
            updateOperations.push(lifecycleOperation);
        }

        invade(model, ['_staleRDFProperties'])._staleRDFProperties = null;

        for (const operation of crdtOperations) {
            const url = operation.mintUrl();

            model.relatedOperations.addRelated(operation);

            operations[url] = operation.createDocumentOperations();
        }

        newOperations?.set(
            model.url,
            updateOperations.map((operation) => operation.requireUrl()),
        );
    }

    return Object.values(operations).flat();
}

export function createModelInceptionOperations(instance: ModelWithUrl, createdAt: Date): EngineOperation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

    return [
        new SetPropertyOperation({
            resourceUrl: instance.url,
            property: RDF_TYPE_PREDICATE.value,
            value: instance.static().getRDFClasses(),
            date: createdAt,
        })
            .setNamedNode(true)
            .setPredicate(RDF_TYPE_PREDICATE),
        ...createInceptionOperations(instance, createdAt),
    ];
}

function getDeletedResourceUrls(models: ModelWithUrl[], document: SolidDocument): string[] {
    const modelUrls = models.map((model) => model.url);
    const quads = document.getQuads();
    const tombstoneUrls = quads
        .filter((quad) => quad.predicate.equals(RDF_TYPE_PREDICATE) && quad.object.equals(CRDT_TOMBSTONE_OBJECT))
        .map((quad) => quad.subject.value);
    const describingResourceUrls = quads
        .filter(
            (quad) =>
                quad.predicate.equals(CRDT_RESOURCE_PREDICATE) &&
                modelUrls.includes(quad.object.value) &&
                !tombstoneUrls.includes(quad.subject.value),
        )
        .map((quad) => quad.subject.value);

    return arrayUnique([
        ...modelUrls,
        ...arrayFilter(models.map((model) => model.metadata?.url)),
        ...describingResourceUrls,
    ]);
}

export function getDeletedModelsCrdtModels(models: Model[]): Set<Model> {
    const deletedModels = models.filter((model) => model.isMarkedForDeletion());

    return new Set(deletedModels.flatMap((model) => arrayFilter([model.metadata, ...(model.operations ?? [])])));
}

export function deletingModelsEmptiesDocument(
    models: ModelWithUrl[],
    document: SolidDocument,
    recordsLocalChanges: (model: Model) => boolean = () => false,
): boolean {
    const deletedResourceUrls = getDeletedResourceUrls(models, document);
    const leavesOtherResources = document.getQuads().some((quad) => !deletedResourceUrls.includes(quad.subject.value));
    const leavesTombstones = models.some((model) => model.leavesTombstones() && !recordsLocalChanges(model));

    return !leavesOtherResources && !leavesTombstones;
}

export function getResourceOperationUrls(document: SolidDocument, resourceUrl: string): string[] {
    const operationTypes = [
        CRDT_SET_PROPERTY_OPERATION_OBJECT,
        CRDT_UNSET_PROPERTY_OPERATION_OBJECT,
        CRDT_ADD_PROPERTY_OPERATION_OBJECT,
        CRDT_REMOVE_PROPERTY_OPERATION_OBJECT,
        CRDT_DELETE_OPERATION_OBJECT,
        CRDT_RESTORE_OPERATION_OBJECT,
    ];

    return document
        .statements(undefined, CRDT_RESOURCE_PREDICATE, resourceUrl)
        .map((quad) => quad.subject)
        .filter((subject) => operationTypes.some((type) => document.contains(subject, RDF_TYPE_PREDICATE, type)))
        .map((subject) => subject.value);
}

export function getDeleteModelsOperations(
    models: ModelWithUrl[],
    document: SolidDocument,
    date: Date = new Date(),
    recordsLocalChanges: (model: Model) => boolean = () => false,
): EngineOperation[] {
    const operations: EngineOperation[] = getDeletedResourceUrls(models, document).map(
        (resourceUrl) => new DeleteResourceOperation(resourceUrl),
    );

    for (const model of models) {
        if (!model.leavesTombstones() || recordsLocalChanges(model)) {
            continue;
        }

        const tombstone = model.relatedTombstone.attach({ deletedAt: date });

        tombstone.mintUrl();
        tombstone.cleanDirty();
        operations.push(...createModelInceptionOperations(tombstone as ModelWithUrl<Tombstone>, tombstone.deletedAt));
    }

    return operations;
}

export async function syncDocumentOperations(documentUrl: string): Promise<{ updated: string[] }> {
    const engine = requireEngine();
    const document = await engine.readDocumentIfExists(documentUrl);

    if (!document) {
        return { updated: [] };
    }

    const promisedOperations = await Promise.all(
        getCoreOperationModels().map((operationModel) => operationModel.createManyFromDocument(document)),
    );

    const operations = sortedOperations(promisedOperations.flat() as Operation[]);
    const propertyOperations = new Map<string, PropertyOperation[]>();
    const finalLifecycleOperations: Record<string, LifecycleOperation> = {};

    for (const operation of operations) {
        if (isLifecycleOperation(operation)) {
            finalLifecycleOperations[operation.resourceUrl] = operation;

            continue;
        }

        if (!isPropertyOperation(operation)) {
            continue;
        }

        const key = getPropertyOperationKey(operation);
        const keyOperations = propertyOperations.get(key) ?? tap([], (ops) => propertyOperations.set(key, ops));

        keyOperations.push(operation);
    }

    const newOperations: Operation[] = [];
    const quads = document.getQuads();

    for (const [resourceUrl, operation] of Object.entries(finalLifecycleOperations)) {
        const metadataSubject = findMetadataSubject(quads, resourceUrl);
        const deletedAt = metadataSubject && document.statement(metadataSubject, CRDT_DELETED_AT_PREDICATE);
        const isSoftDeleted = isBootedModelInstance(operation, 'DeleteOperation');

        if (
            isSoftDeleted === !!deletedAt &&
            (!deletedAt || new Date(deletedAt.object.value).getTime() === operation.date.getTime())
        ) {
            continue;
        }

        newOperations.push(operation.setMetadataSubject(metadataSubject));
    }

    for (const keyOperations of propertyOperations.values()) {
        const lastOperation = required(keyOperations.at(-1));
        const values = foldPropertyOperations(keyOperations);
        const documentValues = getRDFIRIVariants(lastOperation.property)
            .flatMap((variant) => document.statements(lastOperation.resourceUrl, variant))
            .map((quad) => quad.object);

        if (valuesEqual(values, documentValues)) {
            continue;
        }

        newOperations.push(createPropertyResetOperation(lastOperation, values));
    }

    if (newOperations.length === 0) {
        return { updated: [] };
    }

    await engine.updateDocument(documentUrl, newOperations);

    return { updated: arrayUnique(newOperations.map((operation) => operation.resourceUrl)) };
}
