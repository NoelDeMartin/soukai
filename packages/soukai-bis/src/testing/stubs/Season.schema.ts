import { defineSchema, hasOne, requireBootedModel } from 'soukai-bis';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeason',
    relations: {
        show: hasOne(() => requireBootedModel('Show'), 'seasonUrls'),
    },
});
