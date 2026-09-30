import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { date, url } from 'zod';

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
