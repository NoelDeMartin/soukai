// FIXME Remove this file once soukai-bis models support blank nodes and resources without explicit rdf:type triples.
// Until then, ACR blank nodes are replaced with generated IRIs (and kept read-only), and the types implied by ACP
// predicates are added so that ACR resources can be loaded as models.

import { RDFNamedNode, RDFQuad, expandIRI } from '@noeldemartin/solid-utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object, Quad_Subject } from '@rdfjs/types';

const ACP = 'http://www.w3.org/ns/solid/acp#';
const RDF_TYPE = expandIRI('rdf:type');
const BLANK_NODE_IRIS_PATH = '/.well-known/genid/';

const IMPLIED_TYPES_BY_SUBJECT_PREDICATE: Record<string, string> = {
    [`${ACP}resource`]: `${ACP}AccessControlResource`,
    [`${ACP}accessControl`]: `${ACP}AccessControlResource`,
    [`${ACP}memberAccessControl`]: `${ACP}AccessControlResource`,
};

const IMPLIED_TYPES_BY_OBJECT_PREDICATE: Record<string, string> = {
    [`${ACP}accessControl`]: `${ACP}AccessControl`,
    [`${ACP}memberAccessControl`]: `${ACP}AccessControl`,
    [`${ACP}apply`]: `${ACP}Policy`,
    [`${ACP}allOf`]: `${ACP}Matcher`,
    [`${ACP}anyOf`]: `${ACP}Matcher`,
    [`${ACP}noneOf`]: `${ACP}Matcher`,
};

function blankNodeIRI(acrUrl: string, blankNodeId: string): string {
    return new URL(`${BLANK_NODE_IRIS_PATH}${encodeURIComponent(blankNodeId)}`, acrUrl).href;
}

function namedTerm<T extends Quad_Subject | Quad_Object>(acrUrl: string, term: T): T | RDFNamedNode {
    return term.termType === 'BlankNode' ? new RDFNamedNode(blankNodeIRI(acrUrl, term.value)) : term;
}

function impliedTypeQuads(quads: Quad[]): Quad[] {
    return quads.flatMap((quad) => {
        const subjectType = IMPLIED_TYPES_BY_SUBJECT_PREDICATE[quad.predicate.value];
        const objectType = IMPLIED_TYPES_BY_OBJECT_PREDICATE[quad.predicate.value];
        const typeQuads: Quad[] = [];

        if (subjectType) {
            typeQuads.push(new RDFQuad(quad.subject, new RDFNamedNode(RDF_TYPE), new RDFNamedNode(subjectType)));
        }

        if (objectType && quad.object.termType === 'NamedNode') {
            typeQuads.push(new RDFQuad(quad.object, new RDFNamedNode(RDF_TYPE), new RDFNamedNode(objectType)));
        }

        return typeQuads;
    });
}

function modelQuads(acrUrl: string, documentQuads: Quad[]): Quad[] {
    const namedQuads = documentQuads.map(
        (quad) => new RDFQuad(namedTerm(acrUrl, quad.subject), quad.predicate, namedTerm(acrUrl, quad.object)) as Quad,
    );

    return [...namedQuads, ...impliedTypeQuads(namedQuads)];
}

export interface ParsedACR {
    url: string;
    exists: boolean;
    documentQuads: Quad[];
    modelQuads: Quad[];
}

export function isBlankNodeIRI(iri: string): boolean {
    return new URL(iri).pathname.startsWith(BLANK_NODE_IRIS_PATH);
}

export function parseACR(url: string, document: SolidDocument | null): ParsedACR {
    const documentQuads = document?.getQuads() ?? [];

    return { url, exists: !!document, documentQuads, modelQuads: modelQuads(url, documentQuads) };
}
