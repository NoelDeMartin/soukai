import { describe, expect, it } from 'vitest';

import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';

describe('ContainsRelation', () => {

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
        const collection = await PostsCollection.create({ url: 'solid://posts/' });
        const post = new Post({ title: 'Hello World' });

        collection.relatedPosts.attach(post);

        // Act
        await collection.relatedPosts.save(post);

        // Assert
        expect(post.exists()).toBe(true);
        expect(post.url?.startsWith('solid://posts/')).toBe(true);
        expect(collection.resourceUrls).toContain(post.getDocumentUrl());
    });

});
