import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { array, url } from 'zod';

import ACPAccessControl from './ACPAccessControl';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/acp#',
    rdfClass: 'AccessControlResource',
    timestamps: false,
    fields: {
        resourceUrls: rdfProperty(array(url()), 'resource').default([]),
        accessControlUrls: rdfProperty(array(url()), 'accessControl').default([]),
        memberAccessControlUrls: rdfProperty(array(url()), 'memberAccessControl').default([]),
    },
    relations: {
        accessControls: belongsToMany(ACPAccessControl, 'accessControlUrls').usingSameDocument(),
        memberAccessControls: belongsToMany(ACPAccessControl, 'memberAccessControlUrls').usingSameDocument(),
    },
});
