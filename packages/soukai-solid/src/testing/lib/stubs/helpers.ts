import type { EngineDocument } from 'soukai';
import type { JsonLDGraph, JsonLDResource } from '@noeldemartin/solid-utils';

export function stubPersonJsonLD(
    url: string,
    name: string,
    optional: {
        birthDate?: string;
        directed?: string;
        createdAt?: string;
        updatedAt?: string;
    } = {},
): JsonLDGraph & EngineDocument {
    const jsonld: JsonLDResource & { '@context': Record<string, unknown> } = {
        '@context': {
            '@vocab': 'http://xmlns.com/foaf/0.1/',
        },
        '@id': url,
        '@type': 'Person',
        'name': name,
    };

    if (optional.birthDate) {
        jsonld['birthdate'] = {
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
            '@value': optional.birthDate,
        };
    }

    if (optional.directed) {
        jsonld['made'] = { '@id': optional.directed };
    }

    if (optional.createdAt) {
        jsonld['@context']['metadata'] = { '@reverse': 'crdt:resource' };
        jsonld['@context']['crdt'] = 'https://vocab.noeldemartin.com/crdt/';
        jsonld['metadata'] = {
            '@id': `${url}-metadata`,
            '@type': 'crdt:Metadata',
            'crdt:createdAt': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': optional.createdAt,
            },
        };

        if (optional.updatedAt) {
            (jsonld['metadata'] as Record<string, unknown>)['crdt:updatedAt'] = {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': optional.updatedAt,
            };
        }
    }

    return jsonLDGraph(jsonld);
}

export function stubMoviesCollectionJsonLD(
    url: string,
    name: string,
    contains: string[] = [],
): JsonLDGraph & EngineDocument {
    const jsonld: JsonLDResource = {
        '@context': {
            ldp: 'http://www.w3.org/ns/ldp#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        },
        '@id': url,
        '@type': 'ldp:Container',
        'rdfs:label': name,
    };

    if (contains.length === 1) {
        jsonld['ldp:contains'] = { '@id': contains[0] };
    } else if (contains.length > 0) {
        jsonld['ldp:contains'] = contains.map((_url) => ({ '@id': _url }));
    }

    return jsonLDGraph(jsonld);
}

export function stubGroupJsonLD(url: string, name: string): JsonLDGraph & EngineDocument {
    return jsonLDGraph({
        '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
        '@id': url,
        '@type': 'Group',
        'name': name,
    });
}

export function stubMovieJsonLD(
    url: string,
    name: string,
    actions: Record<string, unknown>[] = [],
): JsonLDGraph & EngineDocument {
    const jsonld: JsonLDResource & { '@context': Record<string, unknown> } = {
        '@context': {
            '@vocab': 'https://schema.org/',
        },
        '@id': url,
        '@type': ['Movie'],
        'name': name,
    };

    if (actions.length > 0) {
        jsonld['@context']['actions'] = { '@reverse': 'object' };
        jsonld.actions = actions;
    }

    return jsonLDGraph(jsonld);
}

export function stubWatchActionJsonLD(url: string, movieUrl: string, startTime?: string): JsonLDGraph & EngineDocument {
    const jsonld: JsonLDResource = {
        '@context': {
            '@vocab': 'https://schema.org/',
        },
        '@id': url,
        '@type': 'WatchAction',
        'object': { '@id': movieUrl },
    };

    if (startTime) {
        jsonld['startTime'] = {
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
            '@value': startTime,
        };
    }

    return jsonLDGraph(jsonld);
}

export function stubSolidDocumentJsonLD(url: string, updatedAt: string): JsonLDGraph & EngineDocument {
    return jsonLDGraph({
        '@context': {
            '@vocab': 'http://www.w3.org/ns/iana/media-types/text/turtle#',
            'ldp': 'http://www.w3.org/ns/ldp#',
            'purl': 'http://purl.org/dc/terms/',
        },
        '@id': url,
        '@type': ['ldp:Resource', 'http://www.w3.org/ns/iana/media-types/text/turtle#Resource'],
        'purl:modified': {
            '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
            '@value': updatedAt,
        },
    });
}

export function jsonLDGraph(...resources: JsonLDResource[]): JsonLDGraph & EngineDocument {
    return { '@graph': resources } as JsonLDGraph & EngineDocument;
}
