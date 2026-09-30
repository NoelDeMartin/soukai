import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { date, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Metadata',
    timestamps: false,
    fields: {
        resourceUrl: rdfProperty(url(), 'resource').optional(),
        createdAt: rdfProperty(date(), 'createdAt').optional(),
        updatedAt: rdfProperty(date(), 'updatedAt').optional(),
    },
});
