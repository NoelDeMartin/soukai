import { array, email, number, string, url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { belongsToMany, hasMany, hasOne } from 'soukai-bis/models/relations/fluent';

import Post from './Post';
import User from './User';

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
    relations: {
        posts: hasMany(() => Post, 'authorUrl'),
        friends: belongsToMany(() => User, 'friendUrls'),
        lastPost: hasOne(() => Post, 'authorUrl'),
    },
});
