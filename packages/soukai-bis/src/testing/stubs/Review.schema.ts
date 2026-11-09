import { belongsToOne, defineSchema } from 'soukai-bis';
import { z } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Review',
    fields: {
        itemReviewedUrl: z.url().rdfProperty('itemReviewed'),
        reviewRatingUrl: z.url().rdfProperty('reviewRating').optional(),
    },
    relations: {
        rating: belongsToOne('Rating', 'reviewRatingUrl').usingSameDocument(),
    },
});
