import type Episode from './Episode';
import type ManagerGrant from './ManagerGrant';
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
        ManagerGrant: typeof ManagerGrant;
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
