import { defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
    rdfClass: 'Vtodo',
    rdfDefaultResourceHash: 'task',
    fields: {
        name: z.string().rdfProperty('summary'),
        projectUrl: z.url().rdfProperty('relatedTo').optional(),
    },
});
