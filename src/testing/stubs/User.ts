import { arrayFilter, arrayUnique, urlParse } from '@noeldemartin/utils';

import type { MultiModelRelation, Relation, SingleModelRelation } from '@/models/index';

import Model from './User.schema';
import Post from './Post';
import City from './City';

export default class User extends Model {

    declare public alias: string;
    declare public posts: Post[] | null;
    declare public birthPlace: City | null;
    declare public relatedPosts: MultiModelRelation<User, Post, typeof Post>;
    declare public relatedBirthPlace: SingleModelRelation<User, City, typeof City>;

    public get externalDomains(): string[] {
        return arrayUnique(arrayFilter(this.externalUrls.map(url => urlParse(url)?.domain)));
    }

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
