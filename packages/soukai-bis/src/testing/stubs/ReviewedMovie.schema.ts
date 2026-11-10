import { defineSchema, hasOne } from 'soukai-bis';

import Movie from './Movie';

export default defineSchema(Movie, {
    relations: {
        review: hasOne('Review', 'itemReviewedUrl').usingSameDocument().onDelete('cascade'),
    },
});
