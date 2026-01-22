import { hasItems } from '@noeldemartin/utils';
import { RDFNamedNode, RDFQuad, SolidStore } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import { castToJavaScript, castToRDF, getFinalType } from 'soukai-bis/zod/utils';
import { RDF_TYPE } from 'soukai-bis/utils/rdf';
import type Model from 'soukai-bis/models/Model';
import type { MintedModel, ModelConstructor } from 'soukai-bis/models/types';
import type { Relation } from 'soukai-bis/models/relations';

export function isUsingSameDocument(documentUrl: string | null, relation: Relation, model: Model): boolean {
    return (documentUrl && model.getDocumentUrl() === documentUrl) || relation.usingSameDocument;
}

export function createFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    url: string,
    quads: Quad[],
): MintedModel<T> {
    const { fields, rdfFieldProperties } = modelClass.schema;
    const subject = new RDFNamedNode(url);
    const attributes: Record<string, unknown> = {};
    const store = new SolidStore(quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        const fieldType = getFinalType(type);
        const property = rdfFieldProperties[field];
        const objects = store.statements(subject, property).map((value) => value.object);

        if (!property || !hasItems(objects)) {
            continue;
        }

        attributes[field] = castToJavaScript(objects, fieldType);
    }

    return modelClass.newInstance({ url, ...attributes }, true) as MintedModel<T>;
}

export function serializeToRDF(models: Model[]): Quad[] {
    const statements: Quad[] = [];

    for (const model of models) {
        const { fields, rdfDefaultResourceHash, rdfClasses, rdfFieldProperties } = model.static('schema');
        const subject = new RDFNamedNode(model.url ?? `#${rdfDefaultResourceHash}`);

        for (const rdfClass of rdfClasses) {
            statements.push(new RDFQuad(subject, RDF_TYPE, rdfClass));
        }

        for (const [field, value] of Object.entries(model.getAttributes())) {
            const fieldDefinition = fields.def.shape[field];
            const predicate = rdfFieldProperties[field];

            if (!fieldDefinition || !predicate) {
                continue;
            }

            for (const object of castToRDF(value, fieldDefinition)) {
                statements.push(new RDFQuad(subject, predicate, object));
            }
        }
    }

    return statements;
}
