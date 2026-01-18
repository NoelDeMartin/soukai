import { array, string, url } from 'zod';

import { defineSchema } from './schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'http://www.w3.org/ns/ldp#Container',
    fields: {
        name: string().rdfProperty('rdfs:label').optional(),
        resourceUrls: array(url()).rdfProperty('ldp:contains').default([]),
    },
});
