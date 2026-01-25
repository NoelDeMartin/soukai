import { date, url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Metadata',
    timestamps: false,
    fields: {
        resourceUrl: url().rdfProperty('resource').optional(),
        createdAt: date().rdfProperty('createdAt').optional(),
        updatedAt: date().rdfProperty('updatedAt').optional(),
    },
});
