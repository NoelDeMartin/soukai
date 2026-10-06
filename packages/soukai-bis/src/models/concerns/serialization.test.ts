import { fakeContainerUrl } from '@noeldemartin/testing';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import { clearCache } from 'soukai-bis/models/computed-attributes/helpers';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { describe, expect, it } from 'vite-plus/test';

describe('Models serialization', () => {
    it('hydrates models with relations', async () => {
        // Arrange
        const movie = new Movie({ title: 'Spirited Away' });

        movie.relatedAction.attach({ startTime: new Date('2026-01-01T10:00:00Z') });

        await movie.save();

        const freshMovie = await Movie.findOrFail(movie.requireUrl());

        // Act
        const hydratedMovie = await Movie.hydrate(structuredClone(freshMovie.serialize()));

        // Assert
        expect(hydratedMovie).toBeInstanceOf(Movie);
        expect(hydratedMovie.url).toEqual(movie.url);
        expect(hydratedMovie.title).toEqual('Spirited Away');
        expect(hydratedMovie.exists()).toBe(true);
        expect(hydratedMovie.documentExists()).toBe(true);
        expect(hydratedMovie.isDirty()).toBe(false);
        expect(hydratedMovie.createdAt).toEqual(freshMovie.createdAt);
        expect(hydratedMovie.updatedAt).toEqual(freshMovie.updatedAt);
        expect(hydratedMovie.metadata).toBeInstanceOf(Metadata);
        expect(hydratedMovie.metadata?.url).toEqual(freshMovie.metadata?.url);
        expect(hydratedMovie.metadata?.exists()).toBe(true);
        expect(hydratedMovie.relatedMetadata?.__newModel).toBeUndefined();
        expect(hydratedMovie.action).toBeInstanceOf(WatchAction);
        expect(hydratedMovie.action?.url).toEqual(freshMovie.action?.url);
        expect(hydratedMovie.action?.startTime).toEqual(new Date('2026-01-01T10:00:00Z'));
        expect(hydratedMovie.action?.movie).toBe(hydratedMovie);
    });

    it('updates hydrated models', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spirited Away' });
        const hydratedMovie = await Movie.hydrate(structuredClone(movie.serialize()));

        // Act
        await hydratedMovie.update({ title: 'Princess Mononoke' });

        // Assert
        const freshMovie = await Movie.findOrFail(movie.url);

        expect(freshMovie.title).toEqual('Princess Mononoke');
        expect(freshMovie.createdAt).toEqual(movie.createdAt);
    });

    it('keeps original attributes of hydrated models', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spirited Away' });
        const hydratedMovie = await Movie.hydrate(structuredClone(movie.serialize()));

        // Act
        hydratedMovie.setAttribute('title', 'Princess Mononoke');

        // Assert
        expect(hydratedMovie.title).toEqual('Princess Mononoke');
        expect(hydratedMovie.getOriginalAttribute('title')).toEqual('Spirited Away');
        expect(hydratedMovie.isDirty('title')).toBe(true);
    });

    it('only skips validations while hydrating', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spirited Away' });

        await Movie.hydrate(structuredClone(movie.serialize()));

        // Act
        const newMovie = new Movie({ title: 'Princess Mononoke' });

        // Assert
        expect(newMovie.metadata).toBeInstanceOf(Metadata);
        expect(() => new User({ name: 'John Doe', email: 'invalid-email' })).toThrow(InvalidAttributesError);
    });

    it('hydrates computed attributes and shared instances', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const user = await User.createAt(containerUrl, { name: 'Alice' });
        const post = await Post.create({ title: 'Hello World', authorUrl: user.url });

        user.relatedPosts.related = [post];
        user.relatedLastPost.related = post;

        // Act
        const hydratedUser = await User.hydrate(structuredClone(user.serialize()));

        // Assert
        expect(hydratedUser.postTitles.value).toEqual(['Hello World']);
        expect(hydratedUser.posts?.[0]).toBeInstanceOf(Post);
        expect(hydratedUser.posts?.[0]?.title).toEqual('Hello World');
        expect(hydratedUser.lastPost).toBe(hydratedUser.posts?.[0]);
        expect(hydratedUser.isRelationLoaded('friends')).toBe(false);
    });

    it('hydrates computed attributes without cache', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        await user.loadRelation('posts');
        await user.relatedPosts.create({ title: 'Hello World' });

        const serialized = structuredClone(user.serialize());

        await clearCache();

        // Act
        const hydratedUser = await User.hydrate(serialized);

        // Assert
        expect(serialized.nodes[0]?.computed).toEqual({ postTitles: ['Hello World'] });
        expect(hydratedUser.postTitles.value).toEqual(['Hello World']);
    });
});
