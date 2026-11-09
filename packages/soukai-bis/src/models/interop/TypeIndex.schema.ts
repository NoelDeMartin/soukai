import { documentContainsMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';

export default defineSchema({
    rdfContext: 'http://www.w3.org/ns/solid/terms#',
    rdfClass: 'TypeIndex',
    timestamps: false,
    relations: {
        registrations: documentContainsMany('TypeRegistration'),
    },
});
