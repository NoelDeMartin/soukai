import { defineSchema, hasMany, hasOne } from 'soukai-bis';
import { url } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        postsContainerUrl: url().rdfProperty('weblog').optional(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl').from('postsContainerUrl'),
        lastPost: hasOne('Post', 'authorUrl').from('postsContainerUrl'),
        archivedPosts: hasMany('Post', 'authorUrl').from('archiveContainerUrl'),
        defaultPosts: hasMany('Post', 'authorUrl'),
    },
});
