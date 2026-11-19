import { turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import Movie from 'soukai-bis/testing/stubs/Movie';
import RatingWithHistory from 'soukai-bis/testing/stubs/RatingWithHistory';
import Review from 'soukai-bis/testing/stubs/Review';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it, vi } from 'vite-plus/test';

import type Model from './Model';
import { bootModels } from './registry';
import { defineSchema } from './schema';

describe('Model soft deletes', () => {
    it('soft deletes instances', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        vi.advanceTimersByTime(1000);

        // Act
        await action.softDelete();

        // Assert
        const freshAction = await WatchAction.find(action.url, { includeSoftDeleted: true });

        expect(action.isSoftDeleted()).toBe(true);
        expect(action.isDirty()).toBe(false);
        expect(action.metadata?.deletedAt).toEqual(new Date());
        expect(await WatchAction.find(action.url)).toBeNull();
        expect(await WatchAction.all()).toHaveLength(0);
        expect(await WatchAction.all({ includeSoftDeleted: true })).toHaveLength(1);
        expect(freshAction?.isSoftDeleted()).toBe(true);
        expect(freshAction?.metadata?.deletedAt).toEqual(new Date());
        expect(await operationNames(freshAction)).toContain('DeleteOperation');
    });

    it('restores soft deleted instances', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        vi.advanceTimersByTime(1000);
        await action.softDelete();
        vi.advanceTimersByTime(1000);

        // Act
        await action.restore();

        // Assert
        const freshAction = await WatchAction.find(action.url);

        expect(action.isSoftDeleted()).toBe(false);
        expect(freshAction?.isSoftDeleted()).toBe(false);
        expect(freshAction?.metadata?.deletedAt).toBeUndefined();
        expect(await operationNames(freshAction)).toEqual(
            expect.arrayContaining(['DeleteOperation', 'RestoreOperation']),
        );
    });

    it('emits updated events', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });
        const listener = vi.fn();

        WatchAction.on('updated', listener);

        // Act
        await action.softDelete();
        await action.restore();

        // Assert
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('skips soft deleted instances in relations', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spirited Away' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        await action.softDelete();

        // Act
        const freshMovie = await Movie.findOrFail(movie.url);

        // Assert
        expect(freshMovie.isRelationLoaded('action')).toBe(true);
        expect(freshMovie.action).toBeNull();
    });

    it('loads belongsTo relations in the same document with soft deleted instances', async () => {
        // Arrange
        bootModels({ Rating: RatingWithHistory }, { reset: true });

        const review = new Review({ itemReviewedUrl: 'https://example.com/movie' });
        const rating = review.relatedRating.attach({ ratingValue: 5 });

        await review.save();
        await rating.softDelete();

        // Act
        const freshReview = await Review.findOrFail(review.requireUrl());

        // Assert
        expect(freshReview.isRelationLoaded('rating')).toBe(true);
        expect(freshReview.rating).toBeNull();
        expect(freshReview.reviewRatingUrl).toEqual(rating.url);
    });

    it('keeps soft deletes after schema migrations', async () => {
        // Arrange
        const OtherWatchAction = defineSchema(WatchAction, { rdfDefaultResourceHash: 'action' });
        const action = await WatchAction.create({ startTime: new Date() });

        await action.softDelete();

        // Act
        const migrated = await action.migrateSchema(OtherWatchAction);

        // Assert
        expect(migrated.url).not.toEqual(action.url);
        expect(migrated.isSoftDeleted()).toBe(true);
        expect(await operationNames(migrated)).toContain('DeleteOperation');
    });

    it('reverts soft deletes when saving fails', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        vi.advanceTimersByTime(1000);
        vi.spyOn(engine, 'updateDocument').mockRejectedValueOnce(new Error('Saving failed'));

        // Act
        await expect(action.softDelete()).rejects.toThrow('Saving failed');

        // Assert
        vi.advanceTimersByTime(1000);
        await action.update({ startTime: new Date() });

        expect(action.isSoftDeleted()).toBe(false);
        expect(action.metadata?.deletedAt).toBeUndefined();
        expect(await WatchAction.find(action.url)).not.toBeNull();
    });

    it('prefers soft deletes over restores with the same date', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(
                `
                    @prefix schema: <https://schema.org/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it> a schema:WatchAction .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:updatedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:DeleteOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-2>
                        a crdt:RestoreOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                `,
                { baseIRI: documentUrl },
            ),
        );

        const action = required(await WatchAction.find(`${documentUrl}#it`));

        // Act
        await action.syncOperations();

        // Assert
        expect(action.isSoftDeleted()).toBe(true);
        expect(await WatchAction.find(`${documentUrl}#it`)).toBeNull();
    });

    it('compares soft delete dates when syncing operations', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(
                `
                    @prefix schema: <https://schema.org/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it> a schema:WatchAction .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "2022-01-01T00:00:00Z"^^xsd:dateTime ;
                        crdt:updatedAt "2022-01-01T00:00:00Z"^^xsd:dateTime ;
                        crdt:deletedAt "2022-01-01T00:00:00Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:DeleteOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                `,
                { baseIRI: documentUrl },
            ),
        );

        const action = required(await WatchAction.find(`${documentUrl}#it`, { includeSoftDeleted: true }));
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        // Act
        await action.syncOperations();

        // Assert
        expect(updateDocumentSpy).not.toHaveBeenCalled();
    });

    async function operationNames(model: Model | null | undefined): Promise<string[]> {
        await model?.loadRelation('operations');

        return (model?.operations ?? []).map((operation) => operation.static('modelName'));
    }
});
