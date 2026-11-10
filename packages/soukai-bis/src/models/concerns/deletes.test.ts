import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import { bootModels } from 'soukai-bis/models/registry';
import { belongsToMany, belongsToOne, hasOne } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import Episode from 'soukai-bis/testing/stubs/Episode';
import InverseEpisode from 'soukai-bis/testing/stubs/InverseEpisode';
import InverseSeason from 'soukai-bis/testing/stubs/InverseSeason';
import Rating from 'soukai-bis/testing/stubs/Rating';
import Review from 'soukai-bis/testing/stubs/Review';
import ReviewedMovie from 'soukai-bis/testing/stubs/ReviewedMovie';
import Season from 'soukai-bis/testing/stubs/Season';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import { tombstoneJsonLD } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { url } from 'zod';

describe('Deletes', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('cascades deletes in the same document', async () => {
        // Arrange
        const deletedUrls: string[] = [];
        const show = await Show.create({ name: 'House M.D.' });
        const firstSeason = await show.relatedSeasons.create({});
        const secondSeason = await show.relatedSeasons.create({});
        const freshShow = await Show.findOrFail(show.url);
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        Show.on('deleted', (model) => deletedUrls.push(model.requireUrl()));
        Season.on('deleted', (model) => deletedUrls.push(model.requireUrl()));

        // Act
        await freshShow.delete();

        // Assert
        expect(updateDocumentSpy).not.toHaveBeenCalled();
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(1);
        expect(engine.documents[show.requireDocumentUrl()]).toBeUndefined();
        expect(freshShow.exists()).toBe(false);
        expect(freshShow.seasons?.every((season) => !season.exists())).toBe(true);
        expect(deletedUrls).toHaveLength(3);
        expect(deletedUrls).toEqual(expect.arrayContaining([show.url, firstSeason.url, secondSeason.url]));
    });

    it('cascades deletes into other documents', async () => {
        // Arrange
        class TombstoneShow extends defineSchema(Show, { tombstone: true }) {}
        class TombstoneSeason extends defineSchema(Season, { tombstone: true }) {}
        class TombstoneEpisode extends defineSchema(Episode, { tombstone: true }) {}

        bootModels({ Show: TombstoneShow, Season: TombstoneSeason, Episode: TombstoneEpisode });

        const show = await TombstoneShow.create({ name: 'Breaking Bad' });
        const season = await show.relatedSeasons.create({});
        const firstEpisode = await season.relatedEpisodes.create({ name: 'Pilot' });
        const secondEpisode = await season.relatedEpisodes.create({ name: "Cat's in the Bag..." });
        const freshShow = await TombstoneShow.findOrFail(show.url);
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        // Act
        await freshShow.delete();

        // Assert
        const deletedSeason = freshShow.seasons?.[0] as ModelWithUrl<TombstoneSeason>;
        const deletedEpisodes = deletedSeason.episodes as ModelWithUrl<TombstoneEpisode>[];
        const deletedEpisode = (url: string) => deletedEpisodes.find((episode) => episode.url === url);
        const updatedDocumentUrls = updateDocumentSpy.mock.calls.map(([url]) => url);

        expect(deleteDocumentSpy).not.toHaveBeenCalled();
        expect(updatedDocumentUrls).toHaveLength(3);
        expect(updatedDocumentUrls.slice(0, 2)).toEqual(
            expect.arrayContaining([firstEpisode.requireDocumentUrl(), secondEpisode.requireDocumentUrl()]),
        );
        expect(updatedDocumentUrls[2]).toEqual(show.requireDocumentUrl());

        await expect(engine.documents[show.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(freshShow), tombstoneJsonLD(deletedSeason)],
        });
        await expect(engine.documents[firstEpisode.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(deletedEpisode(firstEpisode.requireUrl()) as ModelWithUrl)],
        });
        await expect(engine.documents[secondEpisode.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(deletedEpisode(secondEpisode.requireUrl()) as ModelWithUrl)],
        });
    });

    it('cascades deletes in the same document when saving models marked for deletion', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });
        const season = await show.relatedSeasons.create({});
        const episode = await season.relatedEpisodes.create({ name: 'Pilot' });
        const freshShow = await Show.findOrFail(show.url);

        // Act
        freshShow.markForDeletion();

        await freshShow.save();

        // Assert
        expect(engine.documents[show.requireDocumentUrl()]).toBeUndefined();
        expect(freshShow.seasons?.[0]?.exists()).toBe(false);
        expect(await Episode.find(episode.requireUrl())).not.toBeNull();
    });

    it('discards unsaved models reached by cascades', async () => {
        // Arrange
        const events: string[] = [];
        const movie = await ReviewedMovie.create({ title: 'Spiderman' });
        const review = movie.relatedReview.attach({}, { mintUrl: true });
        const rating = review.relatedRating.attach({ ratingValue: 8 }, { mintUrl: true });
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        Review.on('created', () => events.push('review-created'));
        Review.on('deleted', () => events.push('review-deleted'));
        Rating.on('created', () => events.push('rating-created'));
        Rating.on('deleted', () => events.push('rating-deleted'));

        // Act
        await movie.delete();

        // Assert
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(1);
        expect(engine.documents[movie.requireDocumentUrl()]).toBeUndefined();
        expect(review.exists()).toBe(false);
        expect(review.isMarkedForDeletion()).toBe(false);
        expect(rating.exists()).toBe(false);
        expect(rating.isMarkedForDeletion()).toBe(false);
        expect(events).toEqual([]);
    });

    it('groups deletes of models sharing other documents', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });
        const season = await show.relatedSeasons.create({});
        const firstEpisode = await season.relatedEpisodes.create({ name: 'Pilot' });
        const documentUrl = firstEpisode.requireDocumentUrl();
        const secondEpisode = await season.relatedEpisodes.create({ url: `${documentUrl}#second`, name: 'Second' });
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        // Act
        await show.delete();

        // Assert
        expect(updateDocumentSpy).not.toHaveBeenCalled();
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(2);
        expect(deleteDocumentSpy).toHaveBeenNthCalledWith(1, documentUrl);
        expect(deleteDocumentSpy).toHaveBeenNthCalledWith(2, show.requireDocumentUrl());
        expect(engine.documents[documentUrl]).toBeUndefined();
        expect(await Episode.find(secondEpisode.requireUrl())).toBeNull();
    });

    it('cascades deletes between documents that cascade into each other', async () => {
        // Arrange
        class CascadingSeason extends defineSchema(InverseSeason, {
            relations: {
                episodes: belongsToMany('InverseEpisode', 'episodeUrls').onDelete('cascade'),
            },
        }) {}

        class CascadingEpisode extends defineSchema(InverseEpisode, {
            relations: {
                season: hasOne('InverseSeason', 'episodeUrls').onDelete('cascade'),
            },
        }) {}

        bootModels({ InverseSeason: CascadingSeason, InverseEpisode: CascadingEpisode });

        let deletedCount = 0;
        const firstEpisode = await CascadingEpisode.create({ name: 'Pilot' });
        const secondEpisode = await CascadingEpisode.create({ name: 'Second' });
        const season = await CascadingSeason.create({
            name: 'Season 1',
            episodeUrls: [firstEpisode.requireUrl(), secondEpisode.requireUrl()],
        });
        const freshSeason = await CascadingSeason.findOrFail(season.url);
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        CascadingSeason.on('deleted', () => deletedCount++);
        CascadingEpisode.on('deleted', () => deletedCount++);

        // Act
        await freshSeason.delete();

        // Assert
        expect(deletedCount).toBe(3);
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(3);
        expect(deleteDocumentSpy).toHaveBeenLastCalledWith(season.requireDocumentUrl());
        expect(freshSeason.episodes?.map((episode) => episode.season)).toEqual([freshSeason, freshSeason]);
        expect(engine.documents[season.requireDocumentUrl()]).toBeUndefined();
        expect(engine.documents[firstEpisode.requireDocumentUrl()]).toBeUndefined();
        expect(engine.documents[secondEpisode.requireDocumentUrl()]).toBeUndefined();
    });

    it('cascades deletes between documents that cascade into each other without inverse relations', async () => {
        // Arrange
        class CascadingUser extends defineSchema(User, {
            relations: {
                friends: belongsToMany('User', 'friendUrls').onDelete('cascade'),
            },
        }) {}

        bootModels({ User: CascadingUser });

        let deletedCount = 0;
        const alice = await CascadingUser.create({ name: 'Alice' });
        const bob = await CascadingUser.create({ name: 'Bob', friendUrls: [alice.url] });

        await alice.update({ friendUrls: [bob.url] });

        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        CascadingUser.on('deleted', () => deletedCount++);

        // Act
        await (await CascadingUser.findOrFail(alice.url)).delete();

        // Assert
        expect(deletedCount).toBe(2);
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(2);
        expect(engine.documents[alice.requireDocumentUrl()]).toBeUndefined();
        expect(engine.documents[bob.requireDocumentUrl()]).toBeUndefined();
    });

    it('deletes models reached by several cascades once', async () => {
        // Arrange
        class CascadingUser extends defineSchema(User, {
            relations: {
                friends: belongsToMany('User', 'friendUrls').onDelete('cascade'),
            },
        }) {}

        bootModels({ User: CascadingUser });

        let deletedCount = 0;
        const charlie = await CascadingUser.create({ name: 'Charlie' });
        const bob = await CascadingUser.create({ name: 'Bob', friendUrls: [charlie.url] });
        const alice = await CascadingUser.create({ name: 'Alice', friendUrls: [bob.url, charlie.url] });
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        CascadingUser.on('deleted', () => deletedCount++);

        // Act
        await (await CascadingUser.findOrFail(alice.url)).delete();

        // Assert
        expect(deletedCount).toBe(3);
        expect(deleteDocumentSpy).toHaveBeenCalledTimes(3);
        expect(deleteDocumentSpy).toHaveBeenLastCalledWith(alice.requireDocumentUrl());
    });

    it('unmarks models when cascading deletes fail', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });

        await show.relatedSeasons.create({});

        const freshShow = await Show.findOrFail(show.url);
        const freshSeason = freshShow.seasons?.[0];

        vi.spyOn(engine, 'readDocuments').mockRejectedValue(new Error('Offline'));

        // Act
        const deletion = freshShow.delete();

        // Assert
        await expect(deletion).rejects.toThrow('Offline');
        expect(freshShow.exists()).toBe(true);
        expect(freshShow.isMarkedForDeletion()).toBe(false);
        expect(freshSeason?.exists()).toBe(true);
        expect(freshSeason?.isMarkedForDeletion()).toBe(false);
        expect(engine.documents[show.requireDocumentUrl()]).toBeDefined();
    });

    it('cascades deletes of detached models into other documents', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });
        const firstSeason = await show.relatedSeasons.create({});
        const secondSeason = await show.relatedSeasons.create({});
        const firstEpisode = await firstSeason.relatedEpisodes.create({ name: 'Pilot' });
        const secondEpisode = await secondSeason.relatedEpisodes.create({ name: 'Seven Thirty-Seven' });
        const freshShow = await Show.findOrFail(show.url);
        const [freshFirstSeason, freshSecondSeason] = freshShow.seasons ?? [];

        // Act
        await freshShow.relatedSeasons.delete(freshFirstSeason as Season);

        freshShow.relatedSeasons.detach(freshSecondSeason as Season, { delete: true });

        await freshShow.delete();

        // Assert
        expect(engine.documents[show.requireDocumentUrl()]).toBeUndefined();
        expect(engine.documents[firstEpisode.requireDocumentUrl()]).toBeUndefined();
        expect(engine.documents[secondEpisode.requireDocumentUrl()]).toBeUndefined();
    });

    it('deletes detached models cascading back into the document once', async () => {
        // Arrange
        class CascadingSeason extends defineSchema(InverseSeason, {
            relations: {
                episodes: belongsToMany('InverseEpisode', 'episodeUrls').onDelete('cascade'),
            },
        }) {}

        class CascadingEpisode extends defineSchema(InverseEpisode, {
            fields: {
                seasonUrl: url().optional(),
            },
            relations: {
                season: belongsToOne('InverseSeason', 'seasonUrl').onDelete('cascade'),
            },
        }) {}

        class CascadingShow extends defineSchema(Show, {
            relations: {
                seasons: belongsToMany('InverseSeason', 'seasonUrls').usingSameDocument(),
            },
        }) {}

        bootModels({ InverseSeason: CascadingSeason, InverseEpisode: CascadingEpisode, Show: CascadingShow });

        let deletedCount = 0;
        const episode = await CascadingEpisode.create({ name: 'Pilot' });
        const show = await CascadingShow.create({ name: 'Breaking Bad' });
        const season = await show.relatedSeasons.create({ name: 'Season 1', episodeUrls: [episode.requireUrl()] });

        await episode.update({ seasonUrl: season.requireUrl() });

        const freshShow = await CascadingShow.findOrFail(show.url);
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        CascadingSeason.on('deleted', () => deletedCount++);
        CascadingEpisode.on('deleted', () => deletedCount++);

        // Act
        freshShow.relatedSeasons.detach(freshShow.seasons?.[0] as CascadingSeason, { delete: true });

        await freshShow.delete();

        // Assert
        expect(deletedCount).toBe(2);
        expect(updateDocumentSpy).not.toHaveBeenCalled();
        expect(deleteDocumentSpy.mock.calls.map(([url]) => url)).toEqual([
            episode.requireDocumentUrl(),
            show.requireDocumentUrl(),
        ]);
    });
});
