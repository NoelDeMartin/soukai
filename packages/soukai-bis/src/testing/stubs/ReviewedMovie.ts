import type { HasOneRelation } from 'soukai-bis';

import type Review from './Review';
import Model from './ReviewedMovie.schema';

export default class ReviewedMovie extends Model {
    declare public relatedReview: HasOneRelation<this, Review, typeof Review>;
}
