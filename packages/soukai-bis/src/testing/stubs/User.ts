import type { BelongsToManyRelation } from 'soukai-bis';

import Model from './User.schema';

export default class User extends Model {

    declare public readonly relatedFriends: BelongsToManyRelation<this, User, typeof User>;

}
