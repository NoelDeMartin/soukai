import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';
import { date } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Resource',
    timestamps: false,
    fields: {
        updatedAt: rdfProperty(date(), 'purl:modified').optional(),
        deepUpdatedAt: rdfProperty(date(), 'extra:deepLastModified').optional(),
    },
});
