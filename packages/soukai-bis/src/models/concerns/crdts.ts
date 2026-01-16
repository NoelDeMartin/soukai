import { RDFNamedNode } from '@noeldemartin/solid-utils';
import { SetPropertyOperation, UnsetPropertyOperation } from 'soukai-bis/models/crdts';
import type { Operation } from 'soukai-bis/models/crdts';

import { castToRDF } from 'soukai-bis/zod/utils';
import type Model from 'soukai-bis/models/Model';
import type { MintedModel } from 'soukai-bis/models/types';

export function getDirtyUpdates<T extends Model>(model: MintedModel<T>): Operation[] {
    const operations: Operation[] = [];
    const schema = model.static().schema;
    const attributes = model.getAttributes();
    const resource = new RDFNamedNode(model.url);

    for (const attribute of model.getDirtyAttributes()) {
        const property = schema.rdfFieldProperties[attribute];
        const value = attributes[attribute];
        const fieldDefinition = schema.fields.def.shape[attribute];

        if (!property || !fieldDefinition) {
            continue;
        }

        if (value === undefined || value === null) {
            operations.push(new UnsetPropertyOperation(resource, property));

            continue;
        }

        operations.push(new SetPropertyOperation(resource, property, castToRDF(value, fieldDefinition)));
    }

    return operations;
}
