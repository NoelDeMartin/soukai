import { date } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';
import { rdfProperty } from 'soukai-bis/zod/soukai';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Resource',
    timestamps: false,
    fields: {
        updatedAt: rdfProperty(date(), 'purl:modified').optional(),
    },
});
