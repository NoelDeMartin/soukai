import { beforeEach, describe, expect, it } from 'vitest';

import User from 'soukai-bis/testing/stubs/User';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models/types';
import type Post from 'soukai-bis/testing/stubs/Post';

describe('HasManyRelation', () => {

    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('creates related models', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        await alice.loadRelationIfUnloaded('posts');

        // Act
        const post = await alice.relatedPosts.create({ title: 'Hello World' });

        // Assert
        expect(alice?.posts).toHaveLength(1);
        expect(alice?.posts?.[0]?.url).toEqual(post.url);

        await expect(engine.documents[post.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': post.url,
                    '@type': 'https://schema.org/Article',
                    'https://schema.org/name': 'Hello World',
                    'https://schema.org/author': [{ '@id': alice.url }],
                },
                metadataJsonLD(post as ModelWithUrl<Post> & ModelWithTimestamps<Post>),
            ],
        });
    });

});
