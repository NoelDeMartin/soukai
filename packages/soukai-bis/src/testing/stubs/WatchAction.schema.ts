import { date, url } from 'zod';
import { belongsToOne, defineSchema } from 'soukai-bis';

import Movie from './Movie';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'WatchAction',
    fields: {
        startTime: date().optional(),
        movieUrl: url().rdfProperty('object').optional(),
    },
    relations: {
        movie: belongsToOne(() => Movie, 'movieUrl'),
    },
});
