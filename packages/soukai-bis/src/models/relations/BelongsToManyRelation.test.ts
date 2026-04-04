import { beforeEach, describe, expect, it } from 'vitest';

import User from 'soukai-bis/testing/stubs/User';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models/types';

describe('BelongsToManyRelation', () => {

    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('initializes empty relations', async () => {
        // Arrange
        const bob = await User.create({ name: 'Bob' });

        // Act
        const user = await User.find(bob.url);

        // Assert
        expect(user?.relatedFriends.loaded).toBe(true);
        expect(user?.relatedFriends.isEmpty()).toBe(true);
        expect(user?.friends).toHaveLength(0);
    });

    it('doesn\'t initialize non-empty relations', async () => {
        // Arrange
        const alice = await User.create({ name: 'Bob' });
        const bob = await User.create({ name: 'Bob', friendUrls: [alice.url] });

        // Act
        const user = await User.find(bob.url);

        // Assert
        expect(user?.relatedFriends.loaded).toBe(false);
        expect(user?.relatedFriends.isEmpty()).toBe(false);
        expect(user?.friends).toBeUndefined();
    });

    it('creates related models', async () => {
        // Arrange
        const alice = await User.create({ name: 'Alice' });

        // Act
        const bob = await alice.relatedFriends.create({ name: 'Bob' });

        // Assert
        expect(alice?.friendUrls).toContain(bob.url);
        expect(alice?.friends).toHaveLength(1);
        expect(alice?.friends?.[0]?.url).toEqual(bob.url);

        await expect(engine.documents[alice.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': alice.url,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'Alice',
                    'http://xmlns.com/foaf/0.1/knows': [{ '@id': bob.url }],
                },
                metadataJsonLD(alice as ModelWithUrl<User> & ModelWithTimestamps<User>),
            ],
        });
    });

});
