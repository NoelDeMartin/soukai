import { defineSchema } from 'soukai-bis/models';
import { array, email, number, string, url } from 'zod';

export default defineSchema({
    crdts: true,
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        email: email().optional(),
        age: number().optional(),
        friendUrls: array(url()).rdfProperty('knows').default([]),
    },
});
