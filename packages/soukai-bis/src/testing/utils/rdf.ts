import { expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';

import { XSD_DATE_TIME } from 'soukai-bis/utils/rdf';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models';

export function metadataJsonLD(model: ModelWithTimestamps & ModelWithUrl): JsonLD {
    return {
        '@id': `${model.url}-metadata`,
        '@type': expandIRI('crdt:Metadata'),
        [expandIRI('crdt:resource')]: { '@id': model.url },
        [expandIRI('crdt:createdAt')]: { '@type': XSD_DATE_TIME, '@value': model.createdAt.toISOString() },
        [expandIRI('crdt:updatedAt')]: { '@type': XSD_DATE_TIME, '@value': model.updatedAt.toISOString() },
    };
}

export function containerTurtle(documents: string[] | Record<string, { lastModifiedAt: Date }>): string {
    const documentUrls = Array.isArray(documents) ? documents : Object.keys(documents);
    const documentMetadatas = Array.isArray(documents)
        ? []
        : Object.entries(documents).map(([url, metadata]) => ({ url, ...metadata }));

    return `
        @prefix ldp: <http://www.w3.org/ns/ldp#> .
        @prefix purl: <http://purl.org/dc/terms/> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        <>
            a ldp:Container ;
            ldp:contains ${documentUrls.map((url) => `<${url}>`).join(', ')} .

        ${documentMetadatas
        .map(
            (metadata) => `
            <${metadata.url}>
                a ldp:Resource ;
                purl:modified "${metadata.lastModifiedAt.toISOString()}"^^xsd:dateTime .
        `,
        )
        .join('\n')}
    `;
}
