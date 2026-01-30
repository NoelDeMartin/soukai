import { objectWithoutEmpty } from '@noeldemartin/utils';
import { ZodArray, ZodURL } from 'zod';

import { RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import { getFinalType } from 'soukai-bis/zod/utils';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Model from 'soukai-bis/models/Model';

function createInceptionOperations(model: Model, now: Date): Operation[] {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');
    const operations: Operation[] = [];
    const schema = model.static('schema');
    const originalAttributes = objectWithoutEmpty(model.getOriginalAttributes());

    delete originalAttributes.url;

    for (const [field, value] of Object.entries(originalAttributes)) {
        if (value === null || (Array.isArray(value) && value.length === 0)) {
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
            date: model.createdAt ?? now,
        });

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
                }).setNamedNode(true),
            );

        for (const attribute of model.getDirtyAttributes()) {
            const property = schema.rdfFieldProperties[attribute];
            const value = attributes[attribute];
            const fieldDefinition = schema.fields.def.shape[attribute];

            if (!property || !fieldDefinition) {
                continue;
            }

            if (value === undefined || value === null) {
                exists &&
                    modelOperations.push(
                        new UnsetPropertyOperation({
                            resourceUrl: model.url,
                            property: property.value,
                            date: model.updatedAt ?? now,
                        }),
                    );

                continue;
            }

            const fieldType = getFinalType(fieldDefinition);
            const operation = new SetPropertyOperation({
                resourceUrl: model.url,
                property: property.value,
                value: Array.isArray(value) ? value : [value],
                date: model.updatedAt ?? now,
            });

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
        if (!model.url || !model.tracksChanges()) {
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
