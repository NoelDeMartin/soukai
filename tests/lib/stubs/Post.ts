import { Model, ModelInterface, FieldType, SingleModelRelation, Relation } from '@/models/index';

import User from './User';

export default class Post extends Model {

    static fields = {
        title: {
            type: FieldType.String,
            required: true,
        },
        body: FieldType.String,
        authorId: FieldType.Key,
    } as const;

    author!: User | null;
    relatedAuthor!: SingleModelRelation<Post, User, typeof User>;

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}

export default interface Post extends ModelInterface<typeof Post> {}
