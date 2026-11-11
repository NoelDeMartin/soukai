import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import { tap, weakMemo } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import { castToRDF } from 'soukai-bis/zod/utils';

export const quadsSourceDocumentUrls = new WeakMap<Quad[], string>();

export function getDocumentQuads(document: SolidDocument): Quad[] {
    return weakMemo('document-quads', document, () =>
        tap(document.getQuads(), (quads) => quadsSourceDocumentUrls.set(quads, document.url)),
    );
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
