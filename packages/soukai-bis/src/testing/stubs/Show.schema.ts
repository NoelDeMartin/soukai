import { belongsToMany, defineSchema } from 'soukai-bis';
import { z } from 'zod';

import Season from './Season';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'TVSeries',
    fields: {
        name: z.string().useAsSlug(),
        seasonUrls: z.array(z.url()).rdfProperty('containsSeason').default([]),
    },
    relations: {
        seasons: belongsToMany(Season, 'seasonUrls').usingSameDocument(),
    },
});
