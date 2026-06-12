import { date, url } from 'zod';
import { belongsToOne, defineSchema } from 'soukai-bis';

import Movie from './Movie';
import Episode from './Episode';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'WatchAction',
    history: true,
    fields: {
        startTime: date().optional(),
        objectUrl: url().rdfProperty('object').optional(),
    },
    relations: {
        movie: belongsToOne(() => Movie, 'objectUrl'),
        episode: belongsToOne(() => Episode, 'objectUrl'),
    },
});
