import type { HasOneRelation } from 'soukai-bis';

import Model from './Movie.schema';
import type WatchAction from './WatchAction';

export default class Movie extends Model {

    declare public relatedAction: HasOneRelation<Movie, WatchAction, typeof WatchAction>;

}
