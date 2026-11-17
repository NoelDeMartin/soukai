import { defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Group',
    history: true,
    fields: {
        name: z.string(),
        nicknames: z.array(z.string()).rdfProperty('nick').optional(),
        memberUrls: z.array(z.url()).rdfProperty('member').optional(),
        makerUrl: z.url().rdfProperty('maker').optional(),
    },
});
