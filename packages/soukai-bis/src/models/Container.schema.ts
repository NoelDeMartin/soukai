import { array, string, url } from 'zod';

import { defineSchema } from './schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Container',
    timestamps: false,
    fields: {
        name: string().rdfProperty('rdfs:label').useAsSlug().optional(),
        resourceUrls: array(url()).rdfProperty('ldp:contains').default([]),
    },
});
