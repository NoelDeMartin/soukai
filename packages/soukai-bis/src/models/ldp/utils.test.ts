import Movie from 'soukai-bis/testing/stubs/Movie';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import ReviewedMovie from 'soukai-bis/testing/stubs/ReviewedMovie';
import { describe, expect, it } from 'vite-plus/test';

import { getRemoteContainerUrl } from './utils';

describe('getRemoteContainerUrl', () => {
    const storageUrl = 'https://alice.example/';

    it('names containers after models', () => {
        expect(getRemoteContainerUrl(Movie, storageUrl)).toEqual('https://alice.example/movies/');
        expect(getRemoteContainerUrl(ReviewedMovie, storageUrl)).toEqual('https://alice.example/reviewedMovies/');
    });

    it('names containers of container models after their contained models', () => {
        expect(getRemoteContainerUrl(MoviesCollection, storageUrl)).toEqual('https://alice.example/movies/');
    });

    it('uses custom paths', () => {
        expect(getRemoteContainerUrl(Movie, storageUrl, 'films')).toEqual('https://alice.example/films/');
        expect(getRemoteContainerUrl(Movie, storageUrl, '/media/films/')).toEqual('https://alice.example/media/films/');
    });
});
