import { describe, expect, it } from 'vitest';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';

import { getComputedAttributes } from './registry';

describe('Computed attributes registry', () => {

    it('populates registries during boot', () => {
        expect(getComputedAttributes(User)).toEqual(['postTitles']);
        expect(getComputedAttributes(Post)).toEqual(['author.postTitles']);
    });

});
