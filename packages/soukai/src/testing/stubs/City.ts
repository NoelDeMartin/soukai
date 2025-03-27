import type { MultiModelRelation, Relation } from 'soukai/models/index';

import Model from './City.schema';
import User from './User';

export default class City extends Model {

    declare public natives: User[] | null;
    declare public relatedNatives: MultiModelRelation<City, User, typeof User>;

    public nativesRelationship(): Relation {
        return this.belongsToMany(User, 'birthRecords');
    }

}
