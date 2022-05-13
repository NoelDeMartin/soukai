import { FieldType } from '@/models';

export class Relation {

    public constructor(private related: typeof Model, private foreignKey: string) {}

}

export class SingleModelRelation extends Relation {}
export class MultipleModelRelation extends Relation {}

export class Model {

    public belongsTo(related: typeof Model, foreignKey: string): SingleModelRelation {
        return new Relation(related, foreignKey);
    }

    public hasMany(related: typeof Model, foreignKey: string): MultipleModelRelation {
        return new Relation(related, foreignKey);
    }

}

export class User extends Model {

    public static fields = {
        name: FieldType.String,
        postIds: {
            type: FieldType.Array,
            items: FieldType.String,
        },
    };

    // declare public posts: Post[];

    public postsRelationship(): MultipleModelRelation {
        return this.hasMany(Post, 'postIds');
    }

}

export class Post extends Model {

    public static fields = {
        title: FieldType.String,
        body: FieldType.String,
        authorId: FieldType.String,
    };

    // declare public author: User;

    public authorRelationship(): SingleModelRelation {
        return this.belongsTo(User, 'authorId');
    }

}

const post = new Post();
const user = new User();

post.author;
user.posts;
