import { beforeEach, describe, expect, it } from 'vitest';
import { sleep } from '@noeldemartin/utils';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';

import ComputedAttribute from './ComputedAttribute';

describe('Computed Attributes', () => {

    beforeEach(() => ComputedAttribute.enableLoadingRelations());

    it('calculates computed attributes', async () => {
        // Starts as empty array
        const user = await User.create({ name: 'Alice' });

        expect(user.postTitles.value).toEqual([]);

        // It's computed when relations are loaded
        user.relatedPosts.related = [new Post({ title: 'Hello World' })];

        await user.postTitles.updateValue({ refresh: true });

        expect(user.postTitles.value).toEqual(['Hello World']);

        // It's restored from cache on instantiation
        const freshUser = await user.fresh();

        expect(freshUser.postTitles.value).toEqual(['Hello World']);
    });

    it('recomputes after saving affected attributes', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        await user.loadRelation('posts');

        // Act
        await user.relatedPosts.create({ title: 'Hello World' });

        // Assert
        const freshUser = await user.fresh();

        expect(freshUser.postTitles.value).toEqual(['Hello World']);
    });

    it('loads relations when subscribed', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        await Post.create({ authorUrl: user.url, title: 'Proactive Post' });

        const freshUser = await user.fresh();
        expect(freshUser.postTitles.value).toEqual([]);
        expect(freshUser.isRelationLoaded('posts')).toBe(false);

        // Act
        let emittedValue: string[] | undefined;
        const unsubscribe = freshUser.postTitles.subscribe((value) => (emittedValue = value));

        // Assert
        await sleep(100);

        unsubscribe();

        expect(emittedValue).toEqual(['Proactive Post']);
        expect(freshUser.postTitles.value).toEqual(['Proactive Post']);
        expect(freshUser.isRelationLoaded('posts')).toBe(false);
    });

});
