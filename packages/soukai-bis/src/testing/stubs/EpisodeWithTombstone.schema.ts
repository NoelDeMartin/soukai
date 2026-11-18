import { belongsToOne, defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVEpisode',
    tombstone: true,
    fields: {
        name: string(),
        seasonUrl: url().optional(),
    },
    relations: {
        season: belongsToOne('SeasonWithTombstone', 'seasonUrl'),
    },
});
