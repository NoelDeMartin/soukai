import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { array, url } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/acp#',
    rdfClass: 'Matcher',
    timestamps: false,
    fields: {
        agents: rdfProperty(array(url()), 'agent').default([]),
        clients: rdfProperty(array(url()), 'client').default([]),
        issuers: rdfProperty(array(url()), 'issuer').default([]),
    },
});
