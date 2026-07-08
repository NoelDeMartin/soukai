import { arrayFilter, arrayUnique, objectWithoutEmpty } from '@noeldemartin/utils';
import { ZodArray, ZodURL } from 'zod';
import type { SolidDocument } from '@noeldemartin/solid-utils';

import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import { getFinalType } from 'soukai-bis/zod/utils';
import { requireBootedModel } from 'soukai-bis/models/registry';
import { requireEngine } from 'soukai-bis/engines/state';
import { sortedOperations } from 'soukai-bis/models/crdts/helpers';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import type Model from 'soukai-bis/models/Model';
import type Tombstone from 'soukai-bis/models/crdts/Tombstone';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type { ModelWithUrl } from 'soukai-bis/models/types';

function createInceptionOperations(model: Model, createdAt: Date): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const operations: Operation[] = [];
    const schema = model.static('schema');
    const originalAttributes = objectWithoutEmpty(model.getOriginalAttributes());

    delete originalAttributes.url;

    for (const [field, value] of Object.entries(originalAttributes)) {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
            continue;
        }

        const property = schema.rdfFieldProperties[field];
        const fieldDefinition = schema.fields.def.shape[field];

        if (!property || !fieldDefinition) {
            continue;
        }

        const fieldType = getFinalType(fieldDefinition);
        const isNamedNode =
            fieldType instanceof ZodURL ||
            (fieldType instanceof ZodArray && getFinalType(fieldType.def.element) instanceof ZodURL);

        const operation = new SetPropertyOperation({
            resourceUrl: model.requireUrl(),
            property: property.value,
            value: Array.isArray(value) ? value : [value],
            date: model.createdAt ?? createdAt,
        }).setPredicate(property);

        if (isNamedNode) {
            operation.setNamedNode(true);
        }

        operations.push(operation);
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
        const schema = model.static('schema');
        const attributes = model.getAttributes();
        const modelOperations = (operations[model.url] ??= []);

        exists ||
            modelOperations.push(
                new SetPropertyOperation({
                    resourceUrl: model.url,
                    property: RDF_TYPE_PREDICATE.value,
                    value: schema.rdfClasses.map(({ value }) => value),
                    date: model.updatedAt ?? now,
                })
                    .setNamedNode(true)
                    .setPredicate(RDF_TYPE_PREDICATE),
            );

        for (const attribute of model.getDirtyAttributes()) {
            const property = schema.rdfFieldProperties[attribute];
            const value = attributes[attribute];
            const fieldDefinition = schema.fields.def.shape[attribute];

            if (!property || !fieldDefinition) {
                continue;
            }

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

            const fieldType = getFinalType(fieldDefinition);
            const operation = new SetPropertyOperation({
                resourceUrl: model.url,
                property: property.value,
                value: Array.isArray(value) ? value : [value],
                date: model.updatedAt ?? now,
            }).setPredicate(property);

            if (
                fieldType instanceof ZodURL ||
                (fieldType instanceof ZodArray && getFinalType(fieldType.def.element) instanceof ZodURL)
            ) {
                operation.setNamedNode(true);
            }

            modelOperations.push(operation);
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
            value: instance.static('schema').rdfClasses.map(({ value }) => value),
            date: createdAt,
        })
            .setNamedNode(true)
            .setPredicate(RDF_TYPE_PREDICATE),
        ...createInceptionOperations(instance, createdAt),
    ];
}

export function deleteModel<T extends Model>(
    model: ModelWithUrl<T>,
    document: SolidDocument,
): EngineOperation[] | null {
    const resourceUrls = arrayFilter([model.url, model.metadata?.url]);
    const otherQuads = document.getQuads().filter((quad) => !resourceUrls.includes(quad.subject.value));

    if (otherQuads.length === 0 && !model.tracksChanges()) {
        return null;
    }

    const operations: EngineOperation[] = resourceUrls.map((resourceUrl) => new DeleteResourceOperation(resourceUrl));

    if (model.leavesTombstones()) {
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
