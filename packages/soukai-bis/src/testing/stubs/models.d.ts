import type Episode from './Episode';
import type Movie from './Movie';
import type MoviesCollection from './MoviesCollection';
import type Post from './Post';
import type PostsCollection from './PostsCollection';
import type Season from './Season';
import type Show from './Show';
import type User from './User';
import type WatchAction from './WatchAction';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Episode: typeof Episode;
        Movie: typeof Movie;
        MoviesCollection: typeof MoviesCollection;
        Post: typeof Post;
        PostsCollection: typeof PostsCollection;
        Season: typeof Season;
        Show: typeof Show;
        User: typeof User;
        WatchAction: typeof WatchAction;
    }
}
