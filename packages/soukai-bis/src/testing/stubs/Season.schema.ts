import { defineSchema, hasMany, hasOne } from 'soukai-bis';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeason',
    relations: {
        show: hasOne('Show', 'seasonUrls'),
        episodes: hasMany('Episode', 'seasonUrl').onDelete('cascade'),
    },
});
