import { beforeEach, describe, expect, it } from 'vitest';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { bootModels } from 'soukai-bis/models/registry';
import { setEngine } from 'soukai-bis/engines/state';

describe('HasOneRelation', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();

        setEngine(engine);
        bootModels({ User, Post, Movie, WatchAction }, true);
    });

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
        const movie = new Movie({ title: 'Spiderman' });
        const action = new WatchAction({ startTime: new Date() });

        // Act
        movie.relatedAction.attach(action);

        // Assert
        expect(movie.action).toBe(action);
        expect(action.movieUrl).toBe(movie.url);
    });

});
