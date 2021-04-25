import type { MultiModelRelation, Relation, SingleModelRelation } from '@/models/index';

import Model from './User.schema';
import Post from './Post';
import City from './City';

export default class User extends Model {

    public alias!: string;
    public posts!: Post[] | null;
    public birthPlace!: City | null;
    public relatedPosts!: MultiModelRelation<User, Post, typeof Post>;
    public relatedBirthPlace!: SingleModelRelation<User, City, typeof City>;

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
