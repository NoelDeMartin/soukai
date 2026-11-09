import { belongsToOne, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    fields: {
        name: z.string(),
        projectUrl: z.url().rdfProperty('object').optional(),
    },
    relations: {
        project: belongsToOne('Project', 'projectUrl'),
    },
});
