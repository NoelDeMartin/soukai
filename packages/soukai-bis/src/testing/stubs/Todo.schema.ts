import { anyOf, defineSchema } from 'soukai-bis';
import { ICAL, SCHEMA } from 'soukai-bis/testing/constants';
import z from 'zod';

export default defineSchema({
    rdfContext: SCHEMA,
    rdfContexts: { ical: ICAL },
    rdfClasses: anyOf(['Action', 'ical:Vtodo']),
    history: true,
    fields: {
        name: z.string().rdfProperties(['name', 'ical:summary']),
        completedAt: z.date().rdfProperties(['endTime', 'ical:completed']).optional(),
        priority: z.string().rdfProperty('ical:priority').optional(),
    },
});
