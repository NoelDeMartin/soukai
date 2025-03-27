import type { Relation } from 'soukai';

import SolidContainer from 'soukai-solid/models/SolidContainer';
import type SolidContainsRelation from 'soukai-solid/models/relations/SolidContainsRelation';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';

export default class MoviesCollection extends SolidContainer {

    public static timestamps = false;

    declare public movies: Movie[] | undefined;
    declare public relatedMovies: SolidContainsRelation<this, Movie, typeof Movie>;

    public moviesRelationship(): Relation {
        return this.contains(Movie);
    }

}
