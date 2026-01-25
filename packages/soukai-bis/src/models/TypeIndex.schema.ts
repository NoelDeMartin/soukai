import TypeRegistration from './TypeRegistration';
import { belongsToMany } from './relations/fluent';
import { defineSchema } from './schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/terms#',
    rdfClass: 'TypeIndex',
    relations: {
        registrations: belongsToMany(TypeRegistration, 'registrationUrls'),
    },
});
