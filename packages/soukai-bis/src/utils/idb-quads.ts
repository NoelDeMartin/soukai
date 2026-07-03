import { RDFLiteral, RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';

import SoukaiError from 'soukai-bis/errors/SoukaiError';

function serializeObject(quad: Quad): IDBTerm {
    const object = quad.object;

    if (object.termType === 'NamedNode') {
        return object.value;
    }

    if (object.termType === 'Literal') {
        const literal: IDBTermLiteral = { v: object.value };

        if (object.language) {
            literal.lang = object.language;
        }

        if (object.datatype && object.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
            literal.dt = object.datatype.value;
        }

        return literal;
    }

    throw new SoukaiError(
        `Unsupported object term type in quad IDB serialization: ${object.termType} ` +
            `(at statement: <${quad.subject.value}> <${quad.predicate.value}>)`,
    );
}

function parseObject(object: IDBTerm): Quad_Object {
    if (typeof object === 'string') {
        return new RDFNamedNode(object);
    }

    const datatypeNode = object.dt ? new RDFNamedNode(object.dt) : undefined;

    return new RDFLiteral(object.v, object.lang, datatypeNode);
}

export type IDBTermIRI = string;
export type IDBTermLiteral = { v: string; dt?: string; lang?: string };
export type IDBTerm = IDBTermIRI | IDBTermLiteral;
export type IDBGraph = Record<string, { p: string; o: IDBTerm }[]>;

export function serializeIDBQuads(quads: Quad[]): IDBGraph {
    const graph: IDBGraph = {};

    for (const quad of quads) {
        if (quad.subject.termType === 'BlankNode' || quad.object.termType === 'BlankNode') {
            throw new SoukaiError(
                'Blank nodes are not supported for quad IDB serialization ' +
                    `(at statement: <${quad.subject.value}> <${quad.predicate.value}>)`,
            );
        }

        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const object = serializeObject(quad);

        graph[subject] ??= [];
        graph[subject].push({ p: predicate, o: object });
    }

    return graph;
}

export function parseIDBQuads(serialized: IDBGraph): Quad[] {
    const quads: Quad[] = [];

    for (const [subjectIri, statements] of Object.entries(serialized)) {
        const subjectNode = new RDFNamedNode(subjectIri);

        for (const statement of statements) {
            const predicateNode = new RDFNamedNode(statement.p);
            const objectNode = parseObject(statement.o);

            quads.push(new RDFQuad(subjectNode, predicateNode, objectNode));
        }
    }

    return quads;
}
