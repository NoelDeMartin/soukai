import { describe, expect, it } from 'vitest';

import User from 'soukai-bis/testing/stubs/User';
import Post from 'soukai-bis/testing/stubs/Post';

import { getRelatedClasses } from './utils';
import { Metadata } from 'soukai-bis/models/crdts';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { Resource } from 'soukai-bis/models/ldp';

describe('Relation utils', () => {

    it('gets related classes', async () => {
        // Arrange
        const expected = [Post, User, Metadata, PostsCollection, Resource];

        // Act
        const actual = getRelatedClasses(Post);

        // Assert
        expect(actual).toEqual(expect.arrayContaining(expected));
        expect(actual).toHaveLength(expected.length);
    });

});
