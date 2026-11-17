import { belongsToMany, defineSchema, hasMany, hasOne, loaded } from 'soukai-bis';
import { array, email, number, string, url } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        givenName: string().optional(),
        lastName: string().rdfProperty('lastName').optional().nullable(),
        email: email().optional(),
        age: number().optional(),
        friendUrls: array(url()).rdfProperty('knows').optional(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl'),
        friends: belongsToMany('User', 'friendUrls'),
        lastPost: hasOne('Post', 'authorUrl'),
    },
    computed: {
        postTitles: (user) => loaded(user, 'posts').map((post) => post.title),
    },
});
