import { date, url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

export const OPERATION_FIELDS = {
    resourceUrl: rdfProperty(url(), 'resource'),
    date: rdfProperty(date(), 'date'),
} as const;

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Operation',
    timestamps: false,
    fields: OPERATION_FIELDS,
});
