import type { BelongsToManyRelation, HasManyRelation } from 'soukai-bis';

import Model from './User.schema';
import type Post from './Post';

export default class User extends Model {

    declare public readonly relatedFriends: BelongsToManyRelation<this, User, typeof User>;
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;

}
