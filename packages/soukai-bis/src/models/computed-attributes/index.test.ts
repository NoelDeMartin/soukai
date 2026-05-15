import { describe, expect, it } from 'vitest';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';

describe('Computed Attributes', () => {

    it('calculates computed attributes', async () => {
        // Starts as undefined
        const user = await User.create({ name: 'Alice' });

        expect(user.postTitles.value).toBeUndefined();

        // It's computed when relations are loaded
        user.relatedPosts.related = [new Post({ title: 'Hello World' })];

        await user.postTitles.updateValue({ refresh: true });

        expect(user.postTitles.value).toEqual(['Hello World']);

        // It's restored from cache on instantiation
        const freshUser = await user.fresh();

        expect(freshUser.postTitles.value).toEqual(['Hello World']);
    });

});
