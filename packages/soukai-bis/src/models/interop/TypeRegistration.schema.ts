import { defineSchema } from 'soukai-bis/models/schema';
import { array, url } from 'zod';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/terms#',
    rdfClass: 'TypeRegistration',
    timestamps: false,
    fields: {
        forClass: array(url()),
        instance: url().optional(),
        instanceContainer: url().optional(),
    },
});
