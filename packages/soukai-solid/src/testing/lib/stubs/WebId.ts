import { type BelongsToManyRelation, type Relation } from 'soukai';
import Person from './Person';
import Model from './WebId.schema';

export default class WebId extends Model {

    declare public knownPersons?: Person[];
    declare public relatedKnownPersons: BelongsToManyRelation<this, Person, typeof Person>;

    public knownPersonsRelationship(): Relation {
        return this.belongsToMany(Person, 'knows');
    }

}