import { describe, expect, it } from 'vitest';
import { fakeResourceUrl } from '@noeldemartin/testing';

import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

describe('HasOneRelation', () => {

    it('loads related model', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });
        const post = await Post.create({
            title: 'Hello World',
            authorUrl: user.url,
        });

        // Act
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeInstanceOf(Post);
        expect(user.lastPost?.url).toBe(post.url);
        expect(user.lastPost?.title).toBe('Hello World');
    });

    it('returns null when related model is missing', async () => {
        // Arrange
        const user = await User.create({ name: 'Bob' });

        // Act
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeNull();
    });

    it('attaches related models', () => {
        // Arrange
        const movieUrl = fakeResourceUrl();
        const movie = new Movie({ url: movieUrl, title: 'Spiderman' });
        const action = new WatchAction({ startTime: new Date(), objectUrl: movieUrl });

        // Act
        movie.relatedAction.attach(action);

        // Assert
        expect(movie.action).toBe(action);
        expect(action.objectUrl).toBe(movie.url);
    });

    it('creates related models using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });

        // Act
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Assert
        expect(action.objectUrl).toBe(movie.url);
        expect(action.objectUrl?.startsWith(movie.requireDocumentUrl())).toBe(true);
    });

    it('loads related model using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });
        const action = await movie.relatedAction.create({ startTime: new Date() });
        const freshMovie = new Movie({ url: movie.url, title: 'Spiderman' });
        freshMovie.setExists(true);

        // Act
        await freshMovie.loadRelation('action');

        // Assert
        expect(freshMovie.action).toBeInstanceOf(WatchAction);
        expect(freshMovie.action?.url).toBe(action.url);
    });

    it('returns null when trying to load from an unsaved parent using same document', async () => {
        // Arrange
        const movie = new Movie({ url: 'http://example.com/movie', title: 'Spiderman' });

        // Act
        const action = await movie.relatedAction.load();

        // Assert
        expect(action).toBeNull();
    });

});
