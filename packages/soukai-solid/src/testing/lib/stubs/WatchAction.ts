import type { Relation } from 'soukai';

import Model from './WatchAction.schema';
import Movie from './Movie';

export default class WatchAction extends Model {

    public movieRelationship(): Relation {
        return this.belongsToOne(Movie, 'object');
    }

}
