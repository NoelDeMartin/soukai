import { defineSchema } from 'soukai-bis/models';
import { string, url } from 'zod';

import { belongsToOne } from 'soukai-bis/models/relations/schema';

import User from './User';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Article',
    fields: {
        title: string().rdfProperty('name'),
        authorUrl: url().rdfProperty('author').optional(),
    },
    relations: {
        author: belongsToOne(User, 'authorUrl'),
    },
});
