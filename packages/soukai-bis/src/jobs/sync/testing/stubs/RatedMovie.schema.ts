import { belongsToOne, defineSchema } from 'soukai-bis';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { url } from 'zod';

export default defineSchema(Movie, {
    history: true,
    fields: { ratingUrl: url().rdfProperty('aggregateRating').optional() },
    relations: {
        rating: belongsToOne('Rating', 'ratingUrl').usingSameDocument().onDelete('cascade'),
    },
});
