import type { Relation } from 'soukai';

import Model from './WatchAction.schema';
import Movie from './Movie';
import Show from './Show';

export default class WatchAction extends Model {

    declare public movie?: Movie;
    declare public show?: Show;

    public movieRelationship(): Relation {
        return this.belongsToOne(Movie, 'object');
    }

    public showRelationship(): Relation {
        return this.belongsToOne(Show, 'object');
    }

}
