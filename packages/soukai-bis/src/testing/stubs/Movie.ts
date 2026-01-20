import type WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import type { HasOneRelation } from 'soukai-bis/models';

import Model from './Movie.schema';

export default class Movie extends Model {

    declare public relatedAction: HasOneRelation<Movie, WatchAction, typeof WatchAction>;

}
