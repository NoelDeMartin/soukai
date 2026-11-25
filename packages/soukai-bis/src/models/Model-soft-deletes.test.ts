import { turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Project from 'soukai-bis/testing/stubs/Project';
import RatingWithHistory from 'soukai-bis/testing/stubs/RatingWithHistory';
import Review from 'soukai-bis/testing/stubs/Review';
import TaskWithHistory from 'soukai-bis/testing/stubs/TaskWithHistory';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it, vi } from 'vite-plus/test';

import type Model from './Model';
import { bootModels } from './registry';
import { remote } from './remote';
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

    it('soft deletes instances using delete()', async () => {
        // Arrange
        WatchAction.useSoftDeletes();

        const action = await WatchAction.create({ startTime: new Date() });

        // Act
        await action.delete();

        // Assert
        expect(action.isSoftDeleted()).toBe(true);
        expect(action.exists()).toBe(true);
        expect(await WatchAction.find(action.url)).toBeNull();
        expect(await WatchAction.find(action.url, { includeSoftDeleted: true })).not.toBeNull();
    });

    it('ignores delete() on soft deleted instances', async () => {
        // Arrange
        WatchAction.useSoftDeletes();

        const action = await WatchAction.create({ startTime: new Date() });
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const deleteDocumentSpy = vi.spyOn(engine, 'deleteDocument');

        await action.delete();
        updateDocumentSpy.mockClear();

        // Act
        await action.delete();

        // Assert
        expect(updateDocumentSpy).not.toHaveBeenCalled();
        expect(deleteDocumentSpy).not.toHaveBeenCalled();
        expect(await WatchAction.find(action.url, { includeSoftDeleted: true })).not.toBeNull();
    });

    it('force deletes instances', async () => {
        // Arrange
        WatchAction.useSoftDeletes();

        const action = await WatchAction.create({ startTime: new Date() });

        await action.delete();

        // Act
        await action.forceDelete();

        // Assert
        expect(action.exists()).toBe(false);
        expect(await WatchAction.find(action.url, { includeSoftDeleted: true })).toBeNull();
    });

    it('toggles soft deletes at runtime', async () => {
        // Arrange
        WatchAction.useSoftDeletes();
        WatchAction.useSoftDeletes(false);

        const action = await WatchAction.create({ startTime: new Date() });

        // Act
        await action.delete();

        // Assert
        expect(WatchAction.usesSoftDeletes()).toBe(false);
        expect(action.exists()).toBe(false);
        expect(await WatchAction.find(action.url, { includeSoftDeleted: true })).toBeNull();
    });

    it('uses soft deletes model by model', () => {
        // Act
        WatchAction.useSoftDeletes();

        // Assert
        expect(WatchAction.usesSoftDeletes()).toBe(true);
        expect(remote(WatchAction).usesSoftDeletes()).toBe(true);
        expect(RatingWithHistory.usesSoftDeletes()).toBe(false);
    });

    it('fails using soft deletes in models without history', () => {
        expect(() => Movie.useSoftDeletes()).toThrow(
            "Can't use soft deletes in Movie models, only models with history and timestamps can be soft deleted.",
        );
        expect(Movie.usesSoftDeletes()).toBe(false);
    });

    it('soft deletes related models using hasOne relations', async () => {
        // Arrange
        WatchAction.useSoftDeletes();

        const movie = await Movie.create({ title: 'Spirited Away' });
        const action = await movie.relatedAction.create({ startTime: new Date() });

        // Act
        await movie.relatedAction.delete();

        // Assert
        const freshMovie = await Movie.findOrFail(movie.url);
        const freshAction = await WatchAction.find(action.requireUrl(), { includeSoftDeleted: true });

        expect(movie.action).toBeNull();
        expect(action.isSoftDeleted()).toBe(true);
        expect(freshMovie.action).toBeNull();
        expect(freshAction?.isSoftDeleted()).toBe(true);
        expect(freshAction?.objectUrl).toEqual(movie.url);
    });

    it('soft deletes related models using hasMany relations', async () => {
        // Arrange
        bootModels({ Task: TaskWithHistory }, { reset: true });
        TaskWithHistory.useSoftDeletes();

        const project = await Project.create({ name: 'Soukai' });
        const first = await project.relatedTasks.create({ name: 'First' });
        const second = await project.relatedTasks.create({ name: 'Second' });

        // Act
        await project.relatedTasks.delete(first);

        // Assert
        const freshProject = await Project.findOrFail(project.url);
        const freshFirst = await TaskWithHistory.find(first.requireUrl(), { includeSoftDeleted: true });

        expect(project.tasks).toEqual([second]);
        expect(first.isSoftDeleted()).toBe(true);
        expect(freshProject.tasks?.map((task) => task.url)).toEqual([second.url]);
        expect(freshFirst?.isSoftDeleted()).toBe(true);
        expect(freshFirst?.projectUrl).toEqual(project.url);
    });

    it('soft deletes related models using belongsTo relations', async () => {
        // Arrange
        bootModels({ Rating: RatingWithHistory }, { reset: true });
        RatingWithHistory.useSoftDeletes();

        const review = new Review({ itemReviewedUrl: 'https://example.com/movie' });
        const rating = review.relatedRating.attach({ ratingValue: 5 });

        await review.save();

        // Act
        await review.relatedRating.delete();

        // Assert
        const freshReview = await Review.findOrFail(review.requireUrl());

        expect(review.rating).toBeNull();
        expect(rating.isSoftDeleted()).toBe(true);
        expect(freshReview.rating).toBeNull();
        expect(freshReview.reviewRatingUrl).toEqual(rating.url);
    });

    it('emits updated events on parents when soft deleting related models', async () => {
        // Arrange
        WatchAction.useSoftDeletes();

        const movie = await Movie.create({ title: 'Spirited Away' });
        const listener = vi.fn();

        await movie.relatedAction.create({ startTime: new Date() });

        Movie.on('updated', listener);

        // Act
        await movie.relatedAction.delete();

        // Assert
        expect(listener).toHaveBeenCalledWith({ model: movie });
    });

    it('keeps relations consistent when soft deleting related models fails', async () => {
        // Arrange
        bootModels({ Task: TaskWithHistory }, { reset: true });
        TaskWithHistory.useSoftDeletes();

        const project = await Project.create({ name: 'Soukai' });
        const first = await project.relatedTasks.create({ name: 'First' });
        const second = await project.relatedTasks.create({ name: 'Second' });

        vi.spyOn(second, 'softDelete').mockRejectedValueOnce(new Error('Saving failed'));

        // Act
        await expect(project.relatedTasks.delete([first, second])).rejects.toThrow('Saving failed');

        // Assert
        expect(first.isSoftDeleted()).toBe(true);
        expect(project.tasks).toEqual([second]);
    });

    async function operationNames(model: Model | null | undefined): Promise<string[]> {
        await model?.loadRelation('operations');

        return (model?.operations ?? []).map((operation) => operation.static('modelName'));
    }
});
