import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models/types';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('HasManyRelation', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('creates related models', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        await alice.loadRelationIfUnloaded('posts');

        // Act
        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Assert
        expect(alice?.posts).toHaveLength(1);
        expect(alice?.posts?.[0]?.url).toEqual(post.url);

        await expect(engine.documents[post.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': post.url,
                    '@type': 'https://schema.org/Article',
                    'https://schema.org/name': 'Hello World',
                    'https://schema.org/author': [{ '@id': alice.url }],
                },
                metadataJsonLD(post as ModelWithUrl<Post> & ModelWithTimestamps<Post>),
            ],
        });
    });

    it('creates related models without loading the relation', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        // Act
        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Assert
        expect(alice.relatedPosts.loaded).toBe(false);
        expect(post.exists()).toBe(true);
        expect(post.authorUrl).toEqual(alice.url);
        expect(post.author).toBe(alice);

        const freshPost = await Post.findOrFail(post.requireUrl());

        expect(freshPost.authorUrl).toEqual(alice.url);
    });

    it('creates related models without loading the relation in models read from documents', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });
        const firstPost = await Post.create({ title: 'First', authorUrl: alice.url });
        const freshAlice = await User.findOrFail(alice.requireUrl());

        // Act
        const secondPost = await freshAlice.relatedPosts.create({ title: 'Second' });

        // Assert
        expect(freshAlice.relatedPosts.loaded).toBe(false);

        await freshAlice.loadRelation('posts');

        expect(freshAlice.posts).toHaveLength(2);
        expect(freshAlice.posts?.map((post) => post.url)).toEqual(
            expect.arrayContaining([firstPost.url, secondPost.url]),
        );
    });

    it('requires loading the relation to detach related models', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });
        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Act & Assert
        expect(() => alice.relatedPosts.detach(post)).toThrow(
            'The "detach" method can\'t be called before loading the relationship',
        );
    });

    it('requires loading the relation to detach or delete related models in models read from documents', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });
        const post = await Post.create({ title: 'Hello World', authorUrl: alice.url });
        const freshAlice = await User.findOrFail(alice.requireUrl());

        // Act & Assert
        expect(() => freshAlice.relatedPosts.detach(post)).toThrow(
            'The "detach" method can\'t be called before loading the relationship',
        );
        await expect(freshAlice.relatedPosts.delete(post)).rejects.toThrow(
            'The "delete" method can\'t be called before loading the relationship',
        );
        expect(freshAlice.relatedPosts.loaded).toBe(false);
    });

    it('detaches related models from other documents', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        await alice.loadRelationIfUnloaded('posts');

        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Act
        alice.relatedPosts.detach(post);

        await alice.save();

        const freshPostBeforeSave = await Post.findOrFail(post.requireUrl());

        await post.save();

        // Assert
        const freshPost = await Post.findOrFail(post.requireUrl());

        expect(alice.posts).toHaveLength(0);
        expect(freshPostBeforeSave.authorUrl).toEqual(alice.url);
        expect(freshPost.authorUrl).toBeUndefined();
    });

    it('detaches and deletes related models from other documents', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        await alice.loadRelationIfUnloaded('posts');

        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Act
        alice.relatedPosts.detach(post, { delete: true });

        await post.save();

        // Assert
        expect(alice.posts).toHaveLength(0);
        expect(post.exists()).toBe(false);
        expect(engine.documents[post.requireDocumentUrl()]).toBeUndefined();
    });
});
