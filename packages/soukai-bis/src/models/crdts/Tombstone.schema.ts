import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { date, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Tombstone',
    timestamps: false,
    fields: {
        resourceUrl: rdfProperty(url(), 'resource'),
        deletedAt: rdfProperty(date(), 'deletedAt'),
    },
});
