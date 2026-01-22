import { array, url } from 'zod';
import { defineSchema } from './schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/terms#',
    rdfClass: 'TypeRegistration',
    fields: {
        forClass: array(url()),
        instance: url().optional(),
        instanceContainer: url().optional(),
    },
});
