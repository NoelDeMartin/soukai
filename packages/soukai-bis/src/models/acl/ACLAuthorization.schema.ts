import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { array, url } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/auth/acl#',
    rdfClass: 'Authorization',
    timestamps: false,
    fields: {
        agents: rdfProperty(array(url()), 'agent').default([]),
        agentClasses: rdfProperty(array(url()), 'agentClass').default([]),
        agentGroups: rdfProperty(array(url()), 'agentGroup').default([]),
        origins: rdfProperty(array(url()), 'origin').default([]),
        accessTo: array(url()).default([]),
        accessToClasses: rdfProperty(array(url()), 'accessToClass').default([]),
        default: array(url()).default([]),
        modes: rdfProperty(array(url()), 'mode').default([]),
    },
});
