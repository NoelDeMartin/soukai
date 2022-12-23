import type { Relation, SingleModelRelation } from '@/models/index';

import Model from './Post.schema';
import User from './User';

export default class Post extends Model {

    declare public author: User | null;
    declare public relatedAuthor: SingleModelRelation<Post, User, typeof User>;

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}
