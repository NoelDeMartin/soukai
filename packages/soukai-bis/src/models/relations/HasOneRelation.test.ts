import { beforeEach, describe, expect, it } from 'vitest';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import { InMemoryEngine, setEngine } from 'soukai-bis/engines';
import { bootModels } from 'soukai-bis/models/utils';

describe('HasOneRelation', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();

        setEngine(engine);
        bootModels({ User, Post }, true);
    });

    it('loads related model', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });
        const post = await Post.create({
            title: 'Hello World',
            authorUrl: user.url,
        });

        // Act
        await user.loadRelation('post');

        // Assert
        expect(user.post).toBeInstanceOf(Post);
        expect(user.post?.url).toBe(post.url);
        expect(user.post?.title).toBe('Hello World');
    });

    it('returns null when related model is missing', async () => {
        // Arrange
        const user = await User.create({ name: 'Bob' });

        // Act
        await user.loadRelation('post');

        // Assert
        expect(user.post).toBeNull();
    });

});
