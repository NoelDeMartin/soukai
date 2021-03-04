import type { MultiModelRelation, Relation, SingleModelRelation } from '@/models/index';

import Model from './User.schema';
import Post from './Post';
import City from './City';

export default class User extends Model {

    alias!: string;
    posts!: Post[] | null;
    birthPlace!: City | null;

    relatedPosts!: MultiModelRelation<User, Post, typeof Post>;
    relatedBirthPlace!: SingleModelRelation<User, City, typeof City>;

    public getAliasAttribute(): string {
        return this.name;
    }

    public postsRelationship(): Relation {
        return this
            .hasMany(Post, 'authorId')
            .onDelete('cascade');
    }

    public birthPlaceRelationship(): Relation {
        return this.hasOne(City, 'birthRecords');
    }

}
