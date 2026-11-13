import { RDFQuad } from '@noeldemartin/solid-utils';
import type { SparqlUpdate } from '@noeldemartin/solid-utils';
import { weakMemo } from '@noeldemartin/utils';
import type { Quad, Quad_Subject } from '@rdfjs/types';
import {
    CRDT_DELETED_AT_PREDICATE,
    CRDT_METADATA_OBJECT,
    CRDT_RESOURCE_PREDICATE,
    RDF_TYPE_PREDICATE,
    createRDFLiteral,
} from 'soukai-bis/lib/internals/rdf';

export function getMetadataUrl(resourceUrl: string): string {
    return resourceUrl.includes('#') ? `${resourceUrl}-metadata` : `${resourceUrl}#metadata`;
}

export function getSoftDeletedResourceUrls(quads: Quad[]): Set<string> {
    return weakMemo('soft-deleted-resource-urls', quads, () => {
        const deletedMetadataUrls = new Set(
            quads.filter((quad) => quad.predicate.equals(CRDT_DELETED_AT_PREDICATE)).map((quad) => quad.subject.value),
        );

        if (deletedMetadataUrls.size === 0) {
            return new Set<string>();
        }

        const metadataUrls = new Set(
            quads
                .filter(
                    (quad) =>
                        deletedMetadataUrls.has(quad.subject.value) &&
                        quad.predicate.equals(RDF_TYPE_PREDICATE) &&
                        quad.object.equals(CRDT_METADATA_OBJECT),
                )
                .map((quad) => quad.subject.value),
        );

        return new Set(
            quads
                .filter(
                    (quad) => metadataUrls.has(quad.subject.value) && quad.predicate.equals(CRDT_RESOURCE_PREDICATE),
                )
                .map((quad) => quad.object.value),
        );
    });
}

export function findMetadataSubject(quads: Quad[], resourceUrl: string): Quad_Subject | null {
    const metadataSubjects = quads
        .filter((quad) => quad.predicate.equals(CRDT_RESOURCE_PREDICATE) && quad.object.value === resourceUrl)
        .map((quad) => quad.subject);

    return (
        metadataSubjects.find((subject) =>
            quads.some(
                (quad) =>
                    quad.subject.equals(subject) &&
                    quad.predicate.equals(RDF_TYPE_PREDICATE) &&
                    quad.object.equals(CRDT_METADATA_OBJECT),
            ),
        ) ?? null
    );
}

export function setDeletedAtInQuads(
    quads: Quad[],
    resourceUrl: string,
    deletedAt: Date | null,
    metadataSubject?: Quad_Subject | null,
): Quad[] {
    const subject = metadataSubject ?? findMetadataSubject(quads, resourceUrl);

    if (!subject) {
        return quads;
    }

    const filteredQuads = quads.filter(
        (quad) => !quad.subject.equals(subject) || !quad.predicate.equals(CRDT_DELETED_AT_PREDICATE),
    );

    return deletedAt
        ? filteredQuads.concat([new RDFQuad(subject, CRDT_DELETED_AT_PREDICATE, createRDFLiteral(deletedAt))])
        : filteredQuads;
}

export function setDeletedAtInSparql(
    sparql: SparqlUpdate,
    deletedAt: Date | null,
    metadataSubject?: Quad_Subject | null,
): void {
    if (!metadataSubject) {
        return;
    }

    sparql.delete(metadataSubject, CRDT_DELETED_AT_PREDICATE);

    if (deletedAt) {
        sparql.insert(new RDFQuad(metadataSubject, CRDT_DELETED_AT_PREDICATE, createRDFLiteral(deletedAt)));
    }
}
