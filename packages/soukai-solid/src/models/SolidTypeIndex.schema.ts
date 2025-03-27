import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    rdfContext: 'http://www.w3.org/ns/solid/terms#',
    rdfsClass: 'TypeIndex',
    timestamps: false,
    fields: {
        registrationUrls: {
            type: FieldType.Array,
            items: FieldType.Key,

            // Note: This term is actually missing from the vocab, but it is used in ActivityPods.
            rdfProperty: 'hasTypeRegistration',
        },
    },
});
