import { getSchema } from 'soukai-bis/models/internals/model';
import { bootModels } from 'soukai-bis/models/registry';
import { hasMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import Post from 'soukai-bis/testing/stubs/Post';
import type Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import { string } from 'zod';

import ComputedAttribute from './ComputedAttribute';
import { clearCache, loaded } from './helpers';

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

    it('infers types from schema definitions', () => {
        expectTypeOf<User['postTitles']>().toEqualTypeOf<ComputedAttribute<string[]>>();
        expectTypeOf<Show['pendingEpisodeDates']>().toEqualTypeOf<ComputedAttribute<Date[]>>();
    });

    it('inherits definitions from base schemas', () => {
        // Arrange
        const ExtendedUser = defineSchema(User, {
            computed: {
                postsCount: (user) => loaded(user, 'posts').length,
            },
        });

        // Assert
        expectTypeOf<InstanceType<typeof ExtendedUser>['postTitles']>().toEqualTypeOf<ComputedAttribute<string[]>>();
        expectTypeOf<InstanceType<typeof ExtendedUser>['postsCount']>().toEqualTypeOf<ComputedAttribute<number>>();
        expect(Object.keys(getSchema(ExtendedUser).computed)).toEqual(['postTitles', 'postsCount']);
    });

    it('restores falsy values from the cache', async () => {
        // Arrange
        const compute = vi.fn((posts: unknown[]) => posts.length);
        const CounterSchema = defineSchema({
            rdfContext: 'http://xmlns.com/foaf/0.1/',
            rdfClass: 'Person',
            fields: {
                name: string(),
            },
            relations: {
                posts: hasMany('Post', 'authorUrl'),
            },
            computed: {
                postsCount: (counter) => compute(loaded(counter, 'posts')),
            },
        });

        class Counter extends CounterSchema {}

        bootModels({ Counter });

        const counter = await Counter.create({ name: 'Alice' });

        await counter.postsCount.updateValue();

        const computeCalls = compute.mock.calls.length;

        // Act
        const value = await counter.postsCount.updateValue();

        // Assert
        expect(value).toBe(0);
        expect(compute).toHaveBeenCalledTimes(computeCalls);
    });
});
