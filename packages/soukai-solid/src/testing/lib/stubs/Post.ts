import type { Relation } from 'soukai';
import type SolidBelongsToOneRelation from 'soukai-solid/models/relations/SolidBelongsToOneRelation';

import Person from './Person';
import Model from './Post.schema';

export default class Post extends Model {
    declare public author?: Person;
    declare public relatedAuthor: SolidBelongsToOneRelation<Post, Person, typeof Person>;

    public authorRelationship(): Relation {
        return this.belongsToOne(Person, 'authorUrl');
    }
}
