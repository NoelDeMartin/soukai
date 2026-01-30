import { array, email, number, string, url } from 'zod';
import { belongsToMany, defineSchema, hasMany, hasOne } from 'soukai-bis';

import Post from './Post';
import Person from './Person';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        givenName: string().optional(),
        lastName: string().rdfProperty('lastName').optional().nullable(),
        email: email().optional(),
        age: number().optional(),
        friendUrls: array(url()).rdfProperty('knows').default([]),
    },
    relations: {
        posts: hasMany(() => Post, 'authorUrl'),
        friends: belongsToMany(() => Person, 'friendUrls'),
        lastPost: hasOne(() => Post, 'authorUrl'),
    },
});
