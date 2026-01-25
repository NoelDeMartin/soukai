import type HasOneRelation from 'soukai-bis/models/relations/HasOneRelation';
import type WatchAction from 'soukai-bis/testing/stubs/WatchAction';

import Model from './Movie.schema';

export default class Movie extends Model {

    declare public relatedAction: HasOneRelation<Movie, WatchAction, typeof WatchAction>;

}
