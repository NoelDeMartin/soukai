import { array, string, url } from 'zod';

import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';

import Resource from './Resource';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Container',
    timestamps: false,
    fields: {
        name: string().rdfProperty('rdfs:label').useAsSlug().optional(),
        resourceUrls: array(url()).rdfProperty('ldp:contains').default([]),
    },
    relations: {
        resources: belongsToMany(Resource, 'resourceUrls').usingSameDocument(),
    },
});
