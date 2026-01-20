import { defineSchema } from 'soukai-bis/models';
import { date, url } from 'zod';

import { belongsToOne } from 'soukai-bis/models/relations/schema';

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
