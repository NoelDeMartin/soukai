import { describe, expect, it } from 'vitest';

import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import Person from 'soukai-bis/testing/stubs/Person';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';

describe('HasOneRelation', () => {

    it('loads related model', async () => {
        // Arrange
        const user = await Person.create({ name: 'Alice' });
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
        const user = await Person.create({ name: 'Bob' });

        // Act
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeNull();
    });

    it('attaches related models', () => {
        // Arrange
        const movie = new Movie({ title: 'Spiderman' });
        const action = new WatchAction({ startTime: new Date() });

        // Act
        movie.relatedAction.attach(action);

        // Assert
        expect(movie.action).toBe(action);
        expect(action.movieUrl).toBe(movie.url);
    });

});
