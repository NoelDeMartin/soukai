import { describe, expect, it } from 'vitest';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';

import { getComputedAttributeDependencies } from './dependencies';

describe('Computed attribute dependencies', () => {

    it('extracts model classes used by compute functions', () => {
        const dependencies = getComputedAttributeDependencies(User, User.computed.postTitles);

        expect(dependencies).toEqual([User, Post]);
    });

    it('only includes the model class itself when no relations are used', () => {
        const dependencies = getComputedAttributeDependencies(User, (user) => user.name);

        expect(dependencies).toEqual([User]);
    });

    it('falls back to all related classes when the simulation fails', () => {
        const dependencies = getComputedAttributeDependencies(User, () => {
            throw new Error('Simulation failed');
        });

        expect(dependencies).toContain(User);
        expect(dependencies).toContain(Post);
    });

});
