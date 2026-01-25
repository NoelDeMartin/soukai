import { RDFNamedNode } from '@noeldemartin/solid-utils';

import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import UnsetPropertyOperation from 'soukai-bis/models/crdts/UnsetPropertyOperation';
import { castToRDF } from 'soukai-bis/zod/utils';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Model from 'soukai-bis/models/Model';

export function getDirtyDocumentsUpdates(models: Model[]): Operation[] {
    const operations: Operation[] = [];

    for (const model of models) {
        if (!model.url) {
            continue;
        }

        const exists = model.exists();
        const schema = model.static('schema');
        const attributes = model.getAttributes();
        const resource = new RDFNamedNode(model.url);

        if (!exists) {
            operations.push(new SetPropertyOperation(resource, RDF_TYPE_PREDICATE, schema.rdfClasses));
        }

        for (const attribute of model.getDirtyAttributes()) {
            const property = schema.rdfFieldProperties[attribute];
            const value = attributes[attribute];
            const fieldDefinition = schema.fields.def.shape[attribute];

            if (!property || !fieldDefinition) {
                continue;
            }

            if (value === undefined || value === null) {
                exists && operations.push(new UnsetPropertyOperation(resource, property));

                continue;
            }

            operations.push(new SetPropertyOperation(resource, property, castToRDF(value, fieldDefinition)));
        }
    }

    return operations;
}
