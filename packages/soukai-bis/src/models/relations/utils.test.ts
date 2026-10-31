import { required } from '@noeldemartin/utils';
import { Metadata } from 'soukai-bis/models/crdts';
import { Resource } from 'soukai-bis/models/ldp';
import { defineSchema } from 'soukai-bis/models/schema';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import { url } from 'zod';

import { belongsToOne } from './fluent';
import { getRelatedClass, getRelatedClasses } from './utils';

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

    it('resolves related classes from registered model names', async () => {
        // Arrange
        const Review = defineSchema({
            fields: {
                authorUrl: url().optional(),
            },
            relations: {
                author: belongsToOne('User', 'authorUrl'),
            },
        });

        const definition = required(Review.schema.relations.author);
        const relatedClassBeforeResolving = definition.relatedClass;

        // Act
        const relatedClass = getRelatedClass(Review, definition);

        // Assert
        expect(relatedClassBeforeResolving).toEqual('User');
        expect(relatedClass).toBe(User);
        expect(definition.relatedClass).toBe(User);
        expectTypeOf<InstanceType<typeof Review>['author']>().toEqualTypeOf<User | undefined>();
    });
});
