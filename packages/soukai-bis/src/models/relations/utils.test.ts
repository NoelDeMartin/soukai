import { Metadata } from 'soukai-bis/models/crdts';
import { Resource } from 'soukai-bis/models/ldp';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, it } from 'vite-plus/test';

import { getRelatedClasses } from './utils';

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
