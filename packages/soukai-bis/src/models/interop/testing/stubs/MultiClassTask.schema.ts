import { defineSchema } from 'soukai-bis';

export default defineSchema({
    rdfContexts: { schema: 'https://schema.org/', ical: 'http://www.w3.org/2002/12/cal/ical#' },
    rdfClasses: ['schema:Action', 'ical:Vtodo'],
});
