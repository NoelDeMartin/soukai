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

export function containerTurtle(documentUrls: string[]): string {
    return `
        @prefix ldp: <http://www.w3.org/ns/ldp#> .

        <>
            a ldp:Container ;
            ldp:contains ${documentUrls.map((url) => `<${url}>`).join(', ')} .
    `;
}
