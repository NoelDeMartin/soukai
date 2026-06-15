import { loaded } from 'soukai-bis';
import type { BelongsToManyRelation, ComputedAttribute, HasManyRelation } from 'soukai-bis';

import Model from './User.schema';
import type Post from './Post';

export default class User extends Model {

    public static computed = {
        postTitles(user: User): string[] {
            return loaded(user, 'posts').map((post) => post.title);
        },
    };

    declare public readonly relatedFriends: BelongsToManyRelation<this, User, typeof User>;
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;
    declare public readonly postTitles: ComputedAttribute<string[]>;

}
