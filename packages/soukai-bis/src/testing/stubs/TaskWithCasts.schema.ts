import { RDFNamedNode } from '@noeldemartin/solid-utils';
import { defineSchema } from 'soukai-bis';
import { ICAL, SCHEMA } from 'soukai-bis/testing/constants';
import z from 'zod';

const PRIORITIES = { high: 1, medium: 5, low: 9 } as const;

export const STATUS_COMPLETED = 'https://schema.org/CompletedActionStatus';
export const STATUS_POTENTIAL = 'https://schema.org/PotentialActionStatus';

export default defineSchema({
    rdfContexts: {
        default: SCHEMA,
        ical: ICAL,
    },
    rdfClass: 'Action',
    history: true,
    fields: {
        name: z.string(),
        completed: z
            .boolean()
            .optional()
            .rdfProperty('actionStatus')
            .rdfCast({
                serialize: (completed) => new RDFNamedNode(completed ? STATUS_COMPLETED : STATUS_POTENTIAL),
                deserialize: ([status]) => status === STATUS_COMPLETED,
            }),
        priority: z
            .enum(['high', 'medium', 'low'])
            .optional()
            .rdfProperty('ical:priority')
            .rdfCast({
                serialize: (priority) => PRIORITIES[priority],
                deserialize: ([priority]) => {
                    const value = Number(priority);

                    return value === 0 ? undefined : value < 5 ? 'high' : value === 5 ? 'medium' : 'low';
                },
            }),
        tags: z
            .array(z.string())
            .default([])
            .rdfProperty('keywords')
            .rdfCast({
                serialize: (tags) => [...new Set(tags)].sort().join(','),
                deserialize: (keywords) => (keywords as string[]).flatMap((keyword) => keyword.split(',')),
            }),
    },
});
