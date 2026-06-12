import { defineSchema, hasMany, hasOne, requireBootedModel } from 'soukai-bis';

import Episode from './Episode';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeason',
    relations: {
        show: hasOne(() => requireBootedModel('Show'), 'seasonUrls'),
        episodes: hasMany(() => Episode, 'seasonUrl'),
    },
});
