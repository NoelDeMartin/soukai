import { defineSchema, hasMany, hasOne } from 'soukai-bis';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeason',
    tombstone: true,
    relations: {
        show: hasOne('ShowWithTombstone', 'seasonUrls'),
        episodes: hasMany('EpisodeWithTombstone', 'seasonUrl').onDelete('cascade'),
    },
});
