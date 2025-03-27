import type { Relation } from 'soukai';

import SolidContainer from 'soukai-solid/models/SolidContainer';
import type SolidContainsRelation from 'soukai-solid/models/relations/SolidContainsRelation';

import Person from 'soukai-solid/testing/lib/stubs/Person';

export default class PersonsCollection extends SolidContainer {

    public static timestamps = false;

    declare public persons: Person[] | undefined;
    declare public relatedPersons: SolidContainsRelation<this, Person, typeof Person>;

    public personsRelationship(): Relation {
        return this.contains(Person);
    }

}
