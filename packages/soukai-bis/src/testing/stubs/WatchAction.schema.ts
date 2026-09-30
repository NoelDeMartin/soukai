import { belongsToOne, defineSchema } from 'soukai-bis';
import { date, url } from 'zod';

import Episode from './Episode';
import Movie from './Movie';

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
