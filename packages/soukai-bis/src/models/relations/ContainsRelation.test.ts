import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, it } from 'vite-plus/test';

import { contains, isContainedBy } from './fluent';

describe('ContainsRelation', () => {
    it('does not cascade deletes', () => {
        expect(() => contains('Post').onDelete('cascade')).toThrow(SoukaiError);
        expect(() => isContainedBy('PostsCollection').onDelete('cascade')).toThrow(SoukaiError);
        expect(contains('Post').onDelete(null).options.onDelete).toBeNull();
        expect(isContainedBy('PostsCollection').onDelete(null).options.onDelete).toBeNull();
    });

    it('creates related model', async () => {
        // Arrange
        const collection = await PostsCollection.create({ url: 'https://example.com/posts/' });

        // Act
        const post = await collection.relatedPosts.create({ title: 'Hello World' });

        // Assert
        expect(post.exists()).toBe(true);
        expect(post.url?.startsWith('https://example.com/posts/')).toBe(true);
        expect(collection.resourceUrls).toContain(post.getDocumentUrl());
    });

    it('saves related model', async () => {
        // Arrange
        const collection = await PostsCollection.create({ url: 'https://example.com/posts/' });
        const post = new Post({ title: 'Hello World' });

        collection.relatedPosts.attach(post);

        // Act
        await collection.relatedPosts.save(post);

        // Assert
        expect(post.exists()).toBe(true);
        expect(post.url?.startsWith('https://example.com/posts/')).toBe(true);
        expect(collection.resourceUrls).toContain(post.getDocumentUrl());
    });

    it('saves related model with default container', async () => {
        // Arrange
        const collection = await PostsCollection.create({ url: 'local://posts/' });
        const post = new Post({ title: 'Hello World' });

        collection.relatedPosts.attach(post);

        // Act
        await collection.relatedPosts.save(post);

        // Assert
        expect(post.exists()).toBe(true);
        expect(post.url?.startsWith('local://posts/')).toBe(true);
        expect(collection.resourceUrls).toContain(post.getDocumentUrl());
    });
});
