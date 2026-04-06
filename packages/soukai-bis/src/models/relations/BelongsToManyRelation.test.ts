import z from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';

import User from 'soukai-bis/testing/stubs/User';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';
import { defineSchema } from 'soukai-bis/models/schema';
import { bootModels } from 'soukai-bis/models/registry';
import type { ModelWithTimestamps, ModelWithUrl } from 'soukai-bis/models/types';
import type { MintUrlOptions } from 'soukai-bis/models/Model';

import { belongsToMany, hasOne } from './fluent';
import type BelongsToManyRelation from './BelongsToManyRelation';

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

    it('sets inverse relationships', async () => {
        // Arrange
        class Episode extends defineSchema({
            fields: { name: z.string() },
            relations: {
                season: hasOne(() => Season, 'episodeUrls'),
            },
        }) {

            protected newUrlDocumentUrl(options: MintUrlOptions = {}): string {
                if (!this.season?.getDocumentUrl()) {
                    return super.newUrlDocumentUrl(options);
                }

                return this.season.getDocumentUrl() + '-episode';
            }
        
        }

        class Season extends defineSchema({
            fields: { name: z.string() },
            relations: {
                episodes: belongsToMany(Episode, 'episodeUrls'),
            },
        }) {

            declare public relatedEpisodes: BelongsToManyRelation<this, Episode, typeof Episode>;
        
        }

        bootModels({ Episode, Season });

        // Act
        const season = await Season.create({ name: 'Season 1' });
        const episode = await season.relatedEpisodes.create({ name: 'Episode 1' });

        // Assert
        expect(episode.season).toBe(season);
        expect(episode.getDocumentUrl()).toBe(season.getDocumentUrl() + '-episode');
    });

});
