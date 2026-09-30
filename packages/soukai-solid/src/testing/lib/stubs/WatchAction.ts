import type { Relation } from 'soukai';

import Movie from './Movie';
import Show from './Show';
import Model from './WatchAction.schema';

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
