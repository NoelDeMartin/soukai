import { defineSchema } from 'soukai-bis';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { z } from 'zod';

export default defineSchema(TaskICalSchema, {
    history: true,
    rdfContexts: { schema: 'https://schema.org/' },
    fields: {
        description: z.string().rdfProperties(['schema:description', 'description']).optional(),
        status: z.string().rdfProperty('status'),
    },
    hooks: {
        beforeInitialize(attributes) {
            attributes.status ??= 'NEEDS-ACTION';
        },
    },
});
