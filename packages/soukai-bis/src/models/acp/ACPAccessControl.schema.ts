import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { array, url } from 'zod';

import ACPPolicy from './ACPPolicy';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/acp#',
    rdfClass: 'AccessControl',
    timestamps: false,
    fields: {
        policyUrls: rdfProperty(array(url()), 'apply').default([]),
    },
    relations: {
        policies: belongsToMany(ACPPolicy, 'policyUrls').usingSameDocument(),
    },
});
