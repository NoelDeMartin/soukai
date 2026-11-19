import { defineSchema } from 'soukai-bis';
import Task from 'soukai-bis/testing/stubs/Task';
import { z } from 'zod';

export default defineSchema(Task, {
    history: true,
    rdfDefaultResourceHash: '',
    fields: {
        description: z.string().optional(),
        priority: z.number().optional(),
    },
});
