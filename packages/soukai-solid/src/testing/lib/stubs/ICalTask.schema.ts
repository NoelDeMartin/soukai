import { FieldType } from 'soukai';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

export const ICAL_TASK_FIELDS = {
    name: {
        type: FieldType.String,
        rdfProperty: 'summary',
    },
    completedAt: {
        type: FieldType.Date,
        rdfProperty: 'completed',
    },
    priority: FieldType.Number,
};

export default defineSolidModelSchema({
    history: true,
    rdfsClass: 'Vtodo',
    rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
    fields: ICAL_TASK_FIELDS,
});
