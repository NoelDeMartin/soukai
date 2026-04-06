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
        const action = new WatchAction({ startTime: new Date(), movieUrl });

        // Act
        movie.relatedAction.attach(action);

        // Assert
        expect(movie.action).toBe(action);
        expect(action.movieUrl).toBe(movie.url);
    });

    it('creates related models using same document', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spiderman' });

        // Act
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Assert
        expect(action.movieUrl).toBe(movie.url);
        expect(action.movieUrl?.startsWith(movie.requireDocumentUrl())).toBe(true);
    });

});
