import { array, string, url } from 'zod';

import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty, useAsSlug } from 'soukai-bis/zod/soukai';

import Resource from './Resource';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Container',
    timestamps: false,
    fields: {
        name: useAsSlug(rdfProperty(string(), 'rdfs:label')).optional(),
        resourceUrls: rdfProperty(array(url()), 'ldp:contains').default([]),
    },
    relations: {
        resources: belongsToMany(Resource, 'resourceUrls').usingSameDocument(),
    },
});
