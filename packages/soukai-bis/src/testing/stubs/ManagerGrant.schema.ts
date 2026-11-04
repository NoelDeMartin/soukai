import ACPAccessControl from 'soukai-bis/models/acp/ACPAccessControl';
import { defineSchema } from 'soukai-bis/models/schema';
import { date, url } from 'zod';

export default defineSchema(ACPAccessControl, {
    rdfContexts: {
        acp: 'http://www.w3.org/ns/solid/acp#',
        ex: 'https://example.org/vocab#',
        dct: 'http://purl.org/dc/terms/',
    },
    rdfClasses: ['acp:AccessControl', 'ex:ManagerGrant'],
    fields: {
        createdAt: date().rdfProperty('dct:created'),
        grantedByUrl: url().rdfProperty('ex:grantedBy').optional(),
    },
});
