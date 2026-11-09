import type Animal from './Animal';
import type Episode from './Episode';
import type InverseEpisode from './InverseEpisode';
import type InverseSeason from './InverseSeason';
import type ManagerGrant from './ManagerGrant';
import type Movie from './Movie';
import type MoviesCollection from './MoviesCollection';
import type Playlist from './Playlist';
import type Post from './Post';
import type PostsCollection from './PostsCollection';
import type Project from './Project';
import type Rating from './Rating';
import type Review from './Review';
import type ReviewedMovie from './ReviewedMovie';
import type Season from './Season';
import type Show from './Show';
import type Song from './Song';
import type Task from './Task';
import type Track from './Track';
import type User from './User';
import type WatchAction from './WatchAction';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Animal: typeof Animal;
        Episode: typeof Episode;
        InverseEpisode: typeof InverseEpisode;
        InverseSeason: typeof InverseSeason;
        ManagerGrant: typeof ManagerGrant;
        Movie: typeof Movie;
        MoviesCollection: typeof MoviesCollection;
        Playlist: typeof Playlist;
        Post: typeof Post;
        PostsCollection: typeof PostsCollection;
        Project: typeof Project;
        Rating: typeof Rating;
        Review: typeof Review;
        ReviewedMovie: typeof ReviewedMovie;
        Season: typeof Season;
        Show: typeof Show;
        Song: typeof Song;
        Task: typeof Task;
        Track: typeof Track;
        User: typeof User;
        WatchAction: typeof WatchAction;
    }
}
