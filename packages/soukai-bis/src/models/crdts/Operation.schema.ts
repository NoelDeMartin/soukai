import { date, url } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';

export const OPERATION_FIELDS = {
    resourceUrl: url().rdfProperty('resource'),
    date: date().rdfProperty('date'),
} as const;

export default defineSchema({
    rdfContext: 'https://vocab.noeldemartin.com/crdt/',
    rdfClass: 'Operation',
    timestamps: false,
    fields: OPERATION_FIELDS,
});
