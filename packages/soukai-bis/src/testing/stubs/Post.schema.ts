import { string, url } from 'zod';
import { belongsToOne, defineSchema, isContainedBy } from 'soukai-bis';

import Person from './Person';
import PostsCollection from './PostsCollection';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Article',
    fields: {
        title: string().rdfProperty('name').useAsSlug(),
        authorUrl: url().rdfProperty('author').optional(),
    },
    relations: {
        author: belongsToOne(() => Person, 'authorUrl'),
        collection: isContainedBy(PostsCollection),
    },
});
