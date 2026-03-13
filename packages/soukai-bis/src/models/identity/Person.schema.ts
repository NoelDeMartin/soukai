import { defineSchema } from 'soukai-bis';
import z from 'zod';

export default defineSchema({
    rdfContexts: {
        default: 'http://xmlns.com/foaf/0.1/',
        solid: 'http://www.w3.org/ns/solid/terms#>',
        pim: 'http://www.w3.org/ns/pim/space#',
        vcard: 'http://www.w3.org/2006/vcard/ns#',
    },
    rdfClass: 'Person',
    fields: {
        name: z.string().optional(),
        storageUrls: z.array(z.url()).rdfProperty('pim:storage').default([]),
        avatarUrl: z.url().rdfProperty('vcard:hasPhoto').optional(),
        oidcIssuerUrl: z.url().rdfProperty('solid:oidcIssuer').optional(),
        publicTypeIndexUrls: z.array(z.url()).rdfProperty('solid:publicTypeIndex').default([]),
        privateTypeIndexUrls: z.array(z.url()).rdfProperty('solid:privateTypeIndex').default([]),
    },
});
