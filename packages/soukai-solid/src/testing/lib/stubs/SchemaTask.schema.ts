import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export default defineSolidModelSchema({
    history: true,
    rdfsClass: 'Action',
    rdfContexts: {
        default: 'https://schema.org/',
        ical: 'http://www.w3.org/2002/12/cal/ical#',
    },
    fields: {
        name: FieldType.String,
        status: FieldType.Key,
        completedAt: {
            type: FieldType.Date,
            rdfProperty: 'ical:completed',
        },
    },
});
