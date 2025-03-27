import type { Relation } from 'soukai';

import type SolidBelongsToManyRelation from 'soukai-solid/models/relations/SolidBelongsToManyRelation';
import type SolidBelongsToOneRelation from 'soukai-solid/models/relations/SolidBelongsToOneRelation';

import Person from 'soukai-solid/testing/lib/stubs/Person';

import Model from './Group.schema';

export default class Group extends Model {

    declare public creator: Person | undefined;
    declare public members: Person[] | undefined;
    declare public relatedCreator: SolidBelongsToOneRelation<Group, Person, typeof Person>;
    declare public relatedMembers: SolidBelongsToManyRelation<Group, Person, typeof Person>;

    public creatorRelationship(): Relation {
        return this.belongsToOne(Person, 'creatorUrl').usingSameDocument(true).onDelete('cascade');
    }

    public membersRelationship(): Relation {
        return this.belongsToMany(Person, 'memberUrls');
    }

}
