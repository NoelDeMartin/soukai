import { defineSchema, hasMany, hasOne } from 'soukai-bis';

import Episode from './Episode';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeason',
    relations: {
        show: hasOne('Show', 'seasonUrls'),
        episodes: hasMany(() => Episode, 'seasonUrl'),
    },
});
