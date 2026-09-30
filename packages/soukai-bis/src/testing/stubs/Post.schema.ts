import { belongsToOne, defineSchema, isContainedBy } from 'soukai-bis';
import { string, url } from 'zod';

import PostsCollection from './PostsCollection';
import User from './User';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Article',
    fields: {
        title: string().rdfProperty('name').useAsSlug(),
        authorUrl: url().rdfProperty('author').optional(),
    },
    relations: {
        author: belongsToOne(() => User, 'authorUrl'),
        collection: isContainedBy(PostsCollection),
    },
});
