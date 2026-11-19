import { RDFLiteral, RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';
import type { LocalFile } from 'soukai-bis/engines/LocalEngine';

import {
    LDP_CONTAINS_PREDICATE,
    LDP_RESOURCE_OBJECT,
    PURL_MODIFIED_PREDICATE,
    RDF_TYPE_PREDICATE,
    XSD_DATE_TIME_TYPE,
} from './rdf';

export const IANA_MEDIA_TYPE_PREFIX = 'http://www.w3.org/ns/iana/media-types/';
export const RDF_MEDIA_TYPES = new Set([
    'text/turtle',
    'application/ld+json',
    'application/n-triples',
    'application/n-quads',
    'text/n3',
    'application/rdf+xml',
    'application/trig',
]);

export function mediaTypeFromRDFType(rdfType: string): string | null {
    if (!rdfType.startsWith(IANA_MEDIA_TYPE_PREFIX)) {
        return null;
    }

    return rdfType.slice(IANA_MEDIA_TYPE_PREFIX.length).replace(/#Resource$/, '');
}

export function mediaTypeToRDFType(mediaType: string): string {
    return `${IANA_MEDIA_TYPE_PREFIX}${mediaType}#Resource`;
}

export function isRDFMediaType(mediaType: string): boolean {
    return RDF_MEDIA_TYPES.has(mediaType.split(';')[0]?.trim() ?? mediaType);
}

export function getResourceMediaTypes(quads: Quad[], resourceUrl: string): string[] {
    return quads
        .filter(
            (quad) =>
                quad.subject.value === resourceUrl &&
                quad.predicate.equals(RDF_TYPE_PREDICATE) &&
                quad.object.value.startsWith(IANA_MEDIA_TYPE_PREFIX),
        )
        .map((quad) => mediaTypeFromRDFType(quad.object.value))
        .filter((mediaType): mediaType is string => !!mediaType);
}

export function isNonRDFMediaTypes(mediaTypes: string[]): boolean {
    return mediaTypes.length > 0 && !mediaTypes.some((mediaType) => isRDFMediaType(mediaType));
}

export function isNonRDFResource(quads: Quad[], resourceUrl: string): boolean {
    if (resourceUrl.endsWith('/')) {
        return false;
    }

    return isNonRDFMediaTypes(getResourceMediaTypes(quads, resourceUrl));
}

export function localFileContainerQuads(containerUrl: string, file: LocalFile): Quad[] {
    const subject = new RDFNamedNode(file.url);
    const mediaType = file.mimeType || 'application/octet-stream';

    const quads = [
        new RDFQuad(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE, subject),
        new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_RESOURCE_OBJECT),
        new RDFQuad(subject, RDF_TYPE_PREDICATE, new RDFNamedNode(mediaTypeToRDFType(mediaType))),
    ];

    if (file.lastModifiedAt) {
        quads.push(
            new RDFQuad(
                subject,
                PURL_MODIFIED_PREDICATE,
                new RDFLiteral(file.lastModifiedAt.toISOString(), undefined, XSD_DATE_TIME_TYPE),
            ),
        );
    }

    return quads;
}
