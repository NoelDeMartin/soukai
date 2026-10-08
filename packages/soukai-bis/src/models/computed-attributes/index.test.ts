import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import ComputedAttribute from './ComputedAttribute';
import { clearCache } from './helpers';

describe('Computed Attributes', () => {
    beforeEach(() => ComputedAttribute.enableLoadingRelations());
    afterEach(() => ComputedAttribute.disableLoadingRelations());

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

    it('loads missing computed attributes', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        await user.loadRelation('posts');
        await user.relatedPosts.create({ title: 'Hello World' });
        await clearCache();

        const freshUser = await user.fresh();

        // Act
        await freshUser.loadComputedAttributes();

        // Assert
        expect(freshUser.postTitles.value).toEqual(['Hello World']);
        expect(freshUser.isRelationLoaded('posts')).toBe(false);
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

    it('coalesces concurrent updates', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });
        const performUpdate = vi.spyOn(
            user.postTitles as unknown as { performUpdate(): Promise<unknown> },
            'performUpdate',
        );

        await user.loadRelation('posts');
        await user.relatedPosts.create({ title: 'Hello World' });

        performUpdate.mockClear();

        // Act
        const values = await Promise.all([
            user.postTitles.updateValue({ refresh: true }),
            user.postTitles.updateValue({ refresh: true }),
            user.postTitles.updateValue({ refresh: true }),
            user.postTitles.updateValue({ refresh: true }),
        ]);

        // Assert
        expect(values).toEqual(Array(4).fill(['Hello World']));
        expect(performUpdate).toHaveBeenCalledTimes(2);
    });
});
