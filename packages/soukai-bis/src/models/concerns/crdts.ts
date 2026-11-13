import type { SolidDocument } from '@noeldemartin/solid-utils';
import { arrayFilter, arrayUnique, invade, objectWithoutEmpty } from '@noeldemartin/utils';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import { requireEngine } from 'soukai-bis/engines/state';
import { CRDT_RESOURCE_PREDICATE, CRDT_TOMBSTONE_OBJECT, RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { sortedOperations } from 'soukai-bis/models/crdts/helpers';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Tombstone from 'soukai-bis/models/crdts/Tombstone';
import { getFieldRdfProperties, getSchema } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import { isUrlField } from 'soukai-bis/zod/utils';

function createInceptionOperations(model: Model, createdAt: Date): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const operations: Operation[] = [];
    const schema = getSchema(model.static());
    const originalAttributes = objectWithoutEmpty(model.getOriginalAttributes());
    const staleRdfProperties = invade(model, ['_staleRdfProperties'])._staleRdfProperties;

    delete originalAttributes.url;

    for (const [field, value] of Object.entries(originalAttributes)) {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
            continue;
        }

        const fieldDefinition = schema.fields.def.shape[field];

        if (!fieldDefinition) {
            continue;
        }

        for (const property of getFieldRdfProperties(model.static(), field)) {
            if (staleRdfProperties?.has(property.value)) {
                continue;
            }

            const operation = new SetPropertyOperation({
                resourceUrl: model.requireUrl(),
                property: property.value,
                value: Array.isArray(value) ? value : [value],
                date: model.createdAt ?? createdAt,
            }).setPredicate(property);

            if (isUrlField(fieldDefinition)) {
                operation.setNamedNode(true);
            }

            operations.push(operation);
        }
    }

    return operations;
}

export function getDirtyDocumentsUpdates(models: Model[]): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const UnsetPropertyOperation = requireBootedModel('UnsetPropertyOperation');
    const now = new Date();
    const operations: Record<string, Operation[]> = {};

    for (const model of models) {
        if (!model.url) {
            continue;
        }

        const exists = model.exists();
        const schema = getSchema(model.static());
        const attributes = model.getAttributes();
        const modelOperations = (operations[model.url] ??= []);

        exists ||
            modelOperations.push(
                new SetPropertyOperation({
                    resourceUrl: model.url,
                    property: RDF_TYPE_PREDICATE.value,
                    value: model.static().getRdfClasses(),
                    date: model.updatedAt ?? now,
                })
                    .setNamedNode(true)
                    .setPredicate(RDF_TYPE_PREDICATE),
            );

        for (const attribute of model.getDirtyAttributes()) {
            const value = attributes[attribute];
            const fieldDefinition = schema.fields.def.shape[attribute];

            if (!fieldDefinition) {
                continue;
            }

            for (const property of getFieldRdfProperties(model.static(), attribute)) {
                if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
                    exists &&
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
                    value: Array.isArray(value) ? value : [value],
                    date: model.updatedAt ?? now,
                }).setPredicate(property);

                if (isUrlField(fieldDefinition)) {
                    operation.setNamedNode(true);
                }

                modelOperations.push(operation);
            }
        }
    }

    for (const model of models) {
        if (!model.url || !model.tracksChanges() || !model.exists()) {
            continue;
        }

        const crdtOperations = new Array<Operation>().concat(operations[model.url] ?? []);

        if (!model.operations || model.operations.length === 0) {
            crdtOperations.push(...createInceptionOperations(model, now));
        }

        invade(model, ['_staleRdfProperties'])._staleRdfProperties = null;

        for (const operation of crdtOperations) {
            const url = operation.mintUrl();

            model.relatedOperations.addRelated(operation);

            operations[url] = operation.createDocumentOperations();
        }
    }

    return Object.values(operations).flat();
}

export function createModelInceptionOperations(instance: ModelWithUrl, createdAt: Date): EngineOperation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

    return [
        new SetPropertyOperation({
            resourceUrl: instance.url,
            property: RDF_TYPE_PREDICATE.value,
            value: instance.static().getRdfClasses(),
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

export function deletingModelsEmptiesDocument(models: ModelWithUrl[], document: SolidDocument): boolean {
    const deletedResourceUrls = getDeletedResourceUrls(models, document);
    const leavesOtherResources = document.getQuads().some((quad) => !deletedResourceUrls.includes(quad.subject.value));
    const leavesTombstones = models.some((model) => model.leavesTombstones());

    return !leavesOtherResources && !leavesTombstones;
}

export function getDeleteModelsOperations(models: ModelWithUrl[], document: SolidDocument): EngineOperation[] {
    const operations: EngineOperation[] = getDeletedResourceUrls(models, document).map(
        (resourceUrl) => new DeleteResourceOperation(resourceUrl),
    );

    for (const model of models) {
        if (!model.leavesTombstones()) {
            continue;
        }

        const tombstone = model.relatedTombstone.attach({ deletedAt: new Date() });

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

    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const UnsetPropertyOperation = requireBootedModel('UnsetPropertyOperation');
    const promisedOperations = await Promise.all([
        SetPropertyOperation.createManyFromDocument(document),
        UnsetPropertyOperation.createManyFromDocument(document),
    ]);

    const operations = sortedOperations(promisedOperations.flat());
    const finalOperations: Record<string, Record<string, Operation>> = {};

    for (const operation of operations) {
        const resourceOperations = (finalOperations[operation.resourceUrl] ??= {});

        resourceOperations[operation.property] = operation;
    }

    const newOperations: Operation[] = [];

    for (const [resourceUrl, resourceOperations] of Object.entries(finalOperations)) {
        for (const [property, operation] of Object.entries(resourceOperations)) {
            const quads = document.statements(resourceUrl, property);

            if (operation instanceof SetPropertyOperation) {
                if (
                    quads.length !== operation.values.length ||
                    quads.some((quad) => !operation.values.some((value) => value.equals(quad.object)))
                ) {
                    newOperations.push(operation);
                }

                continue;
            }

            if (operation instanceof UnsetPropertyOperation) {
                if (quads.length > 0) {
                    newOperations.push(operation);
                }

                continue;
            }
        }
    }

    if (newOperations.length === 0) {
        return { updated: [] };
    }

    await engine.updateDocument(documentUrl, newOperations);

    return { updated: arrayUnique(newOperations.map((operation) => operation.resourceUrl)) };
}
