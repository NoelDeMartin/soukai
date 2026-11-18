import { belongsToMany, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeries',
    tombstone: true,
    fields: {
        name: z.string().useAsSlug(),
        seasonUrls: z.array(z.url()).rdfProperty('containsSeason').default([]),
    },
    relations: {
        seasons: belongsToMany('SeasonWithTombstone', 'seasonUrls').usingSameDocument().onDelete('cascade'),
    },
});
