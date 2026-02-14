import { date } from 'zod';

import { defineSchema } from 'soukai-bis/models/schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/ldp#',
    rdfClass: 'Resource',
    timestamps: false,
    fields: {
        updatedAt: date().rdfProperty('purl:modified').optional(),
    },
});
