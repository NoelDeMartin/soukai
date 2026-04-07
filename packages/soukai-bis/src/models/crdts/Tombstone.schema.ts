import { date, url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Tombstone',
    timestamps: false,
    fields: {
        resourceUrl: rdfProperty(url(), 'resource'),
        deletedAt: rdfProperty(date(), 'deletedAt'),
    },
});
