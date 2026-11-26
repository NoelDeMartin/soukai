import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import { tap, weakMemo } from '@noeldemartin/utils';
import type { Quad, Term } from '@rdfjs/types';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import { getFieldRDFProperties, getSchema } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import { castToRDF } from 'soukai-bis/zod/utils';

const BLANK_NODE_IRI_PREFIX = 'local://blank-node#';

export const quadsSourceDocumentUrls = new WeakMap<Quad[], string>();

export function isBlankNodeUrl(url: string | null | undefined): boolean {
    return !!url?.startsWith(BLANK_NODE_IRI_PREFIX);
}

export function normalizeBlankNodes(quads: Quad[]): Quad[] {
    const hasBlankNodes = quads.some(
        (quad) => quad.subject.termType === 'BlankNode' || quad.object.termType === 'BlankNode',
    );

    if (!hasBlankNodes) {
        return quads;
    }

    const blankNodes = new Map<string, RDFNamedNode>();
    const mapBlankNode = (value: string): RDFNamedNode => {
        const existing = blankNodes.get(value);

        if (existing) {
            return existing;
        }

        const node = new RDFNamedNode(`${BLANK_NODE_IRI_PREFIX}${encodeURIComponent(value)}`);

        blankNodes.set(value, node);

        return node;
    };

    return quads.map((quad) => {
        const subject = quad.subject.termType === 'BlankNode' ? mapBlankNode(quad.subject.value) : quad.subject;
        const object = quad.object.termType === 'BlankNode' ? mapBlankNode(quad.object.value) : quad.object;

        if (subject === quad.subject && object === quad.object) {
            return quad;
        }

        return new RDFQuad(subject, quad.predicate, object);
    });
}

export function convertToRelativeQuads(quads: Quad[], documentUrl: string): Quad[] {
    const toRelative = <T extends Term>(term: T): T =>
        term.termType === 'NamedNode' && (term.value === documentUrl || term.value.startsWith(`${documentUrl}#`))
            ? (new RDFNamedNode(term.value.slice(documentUrl.length)) as unknown as T)
            : term;

    return quads.map((quad) => new RDFQuad(toRelative(quad.subject), quad.predicate, toRelative(quad.object)));
}

export function getDocumentQuads(document: SolidDocument): Quad[] {
    return weakMemo('document-quads', document, () =>
        tap(document.getQuads(), (quads) => quadsSourceDocumentUrls.set(quads, document.url)),
    );
}

export function serializeToRDF(models: Model[]): Quad[] {
    const statements: Quad[] = [];

    for (const model of models) {
        const { fields, rdfDefaultResourceHash, rdfClasses } = getSchema(model.static());
        const subject = new RDFNamedNode(model.url ?? `#${rdfDefaultResourceHash}`);

        for (const rdfClass of rdfClasses.classes) {
            statements.push(new RDFQuad(subject, RDF_TYPE, rdfClass));
        }

        for (const [field, value] of Object.entries(model.getAttributes())) {
            const fieldDefinition = fields.def.shape[field];

            if (!fieldDefinition) {
                continue;
            }

            const objects = castToRDF(value, fieldDefinition);

            for (const predicate of getFieldRDFProperties(model.static(), field)) {
                for (const object of objects) {
                    statements.push(new RDFQuad(subject, predicate, object));
                }
            }
        }
    }

    return statements;
}
