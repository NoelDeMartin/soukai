import z from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

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
        storageUrls: rdfProperty(z.array(z.url()), 'pim:storage').default([]),
        avatarUrl: rdfProperty(z.url(), 'vcard:hasPhoto').optional(),
        oidcIssuerUrl: rdfProperty(z.url(), 'solid:oidcIssuer').optional(),
        publicTypeIndexUrls: rdfProperty(z.array(z.url()), 'solid:publicTypeIndex').default([]),
        privateTypeIndexUrls: rdfProperty(z.array(z.url()), 'solid:privateTypeIndex').default([]),
    },
});
