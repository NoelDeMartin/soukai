import { expandIRI } from '@noeldemartin/solid-utils';
import { defineSchema } from 'soukai-bis';
import z from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Action',
    history: true,
    fields: {
        name: z.string(),
        description: z.string().optional(),
        status: z.string().rdfProperty('actionStatus').optional(),
        completedAt: z.date().rdfProperty('endTime').optional(),
    },
    hooks: {
        beforeInitialize(attributes) {
            attributes.name ??= attributes.description;
        },
        beforeSave() {
            this.status = this.completedAt
                ? expandIRI('schema:CompletedActionStatus')
                : expandIRI('schema:PotentialActionStatus');
        },
    },
});
