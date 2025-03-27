import type { Relation } from 'soukai';

import type SolidHasManyRelation from 'soukai-solid/models/relations/SolidHasManyRelation';
import type SolidHasOneRelation from 'soukai-solid/models/relations/SolidHasOneRelation';

import MoviesCollection from 'soukai-solid/testing/lib/stubs/MoviesCollection';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';

import Model from './Movie.schema';

export default class Movie extends Model {

    declare public director: Person | undefined;
    declare public relatedDirector: SolidHasOneRelation<Movie, Person, typeof Person>;
    declare public actions: WatchAction[] | undefined;
    declare public relatedActions: SolidHasManyRelation<Movie, WatchAction, typeof WatchAction>;
    declare public actors: Person[] | undefined;
    declare public relatedActors: SolidHasManyRelation<Movie, Person, typeof Person>;
    declare public collection: MoviesCollection | undefined;

    public directorRelationship(): Relation {
        return this.hasOne(Person, 'directed').usingSameDocument().onDelete('cascade');
    }

    public actorsRelationship(): Relation {
        return this.hasMany(Person, 'starred').usingSameDocument().onDelete('cascade');
    }

    public actionsRelationship(): Relation {
        return this.hasMany(WatchAction, 'object').usingSameDocument().onDelete('cascade');
    }

    public collectionRelationship(): Relation {
        return this.isContainedBy(MoviesCollection);
    }

}
