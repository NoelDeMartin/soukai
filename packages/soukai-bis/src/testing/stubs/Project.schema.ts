import { defineSchema, hasMany } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Project',
    history: true,
    fields: {
        name: z.string(),
    },
    relations: {
        tasks: hasMany('Task', 'projectUrl').usingSameDocument(),
    },
});
