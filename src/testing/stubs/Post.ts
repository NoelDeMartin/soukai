import { FieldType, Model } from '@/models/index';
import type { IModel, Relation, SingleModelRelation } from '@/models/index';

import User from './User';

export default class Post extends Model {

    public static fields = {
        title: {
            type: FieldType.String,
            required: true,
        },
        body: FieldType.String,
        authorId: FieldType.Key,
    } as const;

    declare public author: User | null;
    declare public relatedAuthor: SingleModelRelation<Post, User, typeof User>;

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}

export default interface Post extends IModel<typeof Post> {}
