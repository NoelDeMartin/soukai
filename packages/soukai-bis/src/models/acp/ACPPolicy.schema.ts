import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { array, url } from 'zod';

import ACPMatcher from './ACPMatcher';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/acp#',
    rdfClass: 'Policy',
    timestamps: false,
    fields: {
        allow: array(url()).default([]),
        deny: array(url()).default([]),
        allOfUrls: rdfProperty(array(url()), 'allOf').default([]),
        anyOfUrls: rdfProperty(array(url()), 'anyOf').default([]),
        noneOfUrls: rdfProperty(array(url()), 'noneOf').default([]),
    },
    relations: {
        allOfMatchers: belongsToMany(ACPMatcher, 'allOfUrls').usingSameDocument(),
        anyOfMatchers: belongsToMany(ACPMatcher, 'anyOfUrls').usingSameDocument(),
        noneOfMatchers: belongsToMany(ACPMatcher, 'noneOfUrls').usingSameDocument(),
    },
});
