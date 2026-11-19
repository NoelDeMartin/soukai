import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { arrayUnique } from '@noeldemartin/utils';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import Movie from 'soukai-bis/testing/stubs/Movie';
import PlaylistWithHistory from 'soukai-bis/testing/stubs/PlaylistWithHistory';
import Post from 'soukai-bis/testing/stubs/Post';
import Season from 'soukai-bis/testing/stubs/Season';
import Show from 'soukai-bis/testing/stubs/Show';
import Song from 'soukai-bis/testing/stubs/Song';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { engine } from 'soukai-bis/testing/utils/engines';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type Model from './Model';

describe('Model local changes', () => {
    beforeEach(() => {
        trackLocalChanges(Movie);
        trackLocalChanges(Show);
        trackLocalChanges(Season);
        trackLocalChanges(WatchAction);
    });

    it('records created resources', async () => {
        // Act
        const action = await WatchAction.create({ startTime: new Date() });

        // Assert
        expect(await engine.getDocumentLocalChanges(action.requireDocumentUrl())).toEqual({
            resources: { [action.url]: { createdAt: expect.any(Date) } },
        });
        expect(Object.keys(await engine.getDocumentsLocalChanges())).toEqual([action.requireDocumentUrl()]);
    });

    it('records operations without inception operations', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        await markAsSynced(action);

        vi.advanceTimersByTime(1000);

        // Act
        await action.update({ startTime: new Date() });

        // Assert
        const updateOperation = action.operations?.find((operation) => operation.date.getTime() === Date.now());

        expect(action.operations?.length).toBeGreaterThan(1);
        expect(await engine.getDocumentLocalChanges(action.requireDocumentUrl())).toEqual({
            resources: { [action.url]: { newOperations: [updateOperation?.url] } },
        });
    });

    it('records related changes in the same document once', async () => {
        // Arrange
        const movie = await Movie.create({ title: 'Spirited Away' });
        const listener = vi.fn();
        const removeListener = engine.listeners.add({ onLocalChangesUpdated: listener });

        await markAsSynced(movie);
        listener.mockClear();

        try {
            // Act
            movie.relatedAction.attach({ startTime: new Date() });

            await movie.save();

            // Assert
            expect(listener).toHaveBeenCalledOnce();
            expect(Object.keys(await engine.getDocumentsLocalChanges())).toEqual([movie.requireDocumentUrl()]);
            expect(await engine.getDocumentLocalChanges(movie.requireDocumentUrl())).toEqual({
                resources: { [movie.action?.requireUrl() ?? '']: { createdAt: expect.any(Date) } },
            });
        } finally {
            removeListener();
        }
    });

    it('records related changes in other documents with the same date', async () => {
        // Arrange
        trackLocalChanges(PlaylistWithHistory);
        trackLocalChanges(Song);

        const playlist = await PlaylistWithHistory.create({ name: 'Favorites' });

        await markAsSynced(playlist);
        await playlist.loadRelationIfUnloaded('songs');

        vi.advanceTimersByTime(1000);
        Song.on('created', () => vi.advanceTimersByTime(1000));

        // Act
        const song = await playlist.relatedSongs.create({ title: 'Hello' });

        // Assert
        const songChanges = await engine.getDocumentLocalChanges(song.requireDocumentUrl());
        const playlistChanges = await engine.getDocumentLocalChanges(playlist.requireDocumentUrl());
        const operationUrls = playlistChanges?.resources[playlist.url]?.newOperations ?? [];
        const operations =
            playlist.operations?.filter((operation) => operationUrls.includes(operation.requireUrl())) ?? [];

        expect(songChanges).toEqual({ resources: { [song.requireUrl()]: { createdAt: expect.any(Date) } } });
        expect(operations.length).toBeGreaterThan(0);
        expect(operations.map((operation) => operation.date.getTime())).toEqual(
            operations.map(() => songChanges?.resources[song.requireUrl()]?.createdAt?.getTime()),
        );
    });

    it('ignores models that do not record local changes', async () => {
        // Act
        const post = await Post.create({ title: 'Hello World' });

        // Assert
        expect(await engine.getDocumentLocalChanges(post.requireDocumentUrl())).toBeNull();
        expect(await engine.getDocumentsLocalChanges()).toEqual({});
    });

    it('records local deletions', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });
        const listener = vi.fn();

        await markAsSynced(action);

        WatchAction.on('deleted', listener);

        // Act
        await action.delete();

        // Assert
        const documentUrl = action.requireDocumentUrl();
        const rawDocument = await engine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(listener).toHaveBeenCalledTimes(1);
        expect(action.exists()).toBe(false);
        expect(await engine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [action.url]: { deletedAt: expect.any(Date) } },
        });
        expect(rawDocument.getQuads()).toHaveLength(0);
        expect(await engine.readDocumentIfExists(documentUrl)).toBeNull();
        expect(await WatchAction.find(action.url)).toBeNull();
        expect(await WatchAction.all()).toHaveLength(0);
    });

    it('records deleted operations in local deletions', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        vi.advanceTimersByTime(1000);

        await action.update({ startTime: new Date() });
        await markAsSynced(action);

        const operationUrls = (action.operations ?? []).map((operation) => operation.url);

        // Act
        await action.delete();

        // Assert
        const localChanges = await engine.getDocumentLocalChanges(action.requireDocumentUrl());

        expect(operationUrls.length).toBeGreaterThan(1);
        expect(localChanges?.resources[action.url]).toEqual({
            deletedAt: expect.any(Date),
            deletedOperations: expect.arrayContaining(operationUrls),
        });
        expect(localChanges?.resources[action.url]).toHaveProperty('deletedOperations.length', operationUrls.length);
    });

    it('removes resources created locally', async () => {
        // Arrange
        const action = await WatchAction.create({ startTime: new Date() });

        // Act
        await action.delete();

        // Assert
        const documentUrl = action.requireDocumentUrl();

        expect(await engine.readDocumentIfExists(documentUrl, { includeEmptyDocuments: true })).toBeNull();
        expect(await engine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('mixes local deletions and removals in the same document', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });

        await markAsSynced(show);

        const season = await show.relatedSeasons.create({});

        // Act
        await show.delete();

        // Assert
        const documentUrl = show.requireDocumentUrl();
        const rawDocument = await engine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(await engine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [show.url]: { deletedAt: expect.any(Date) } },
        });
        expect(rawDocument.contains(show.url)).toBe(false);
        expect(rawDocument.contains(season.requireUrl())).toBe(false);
    });

    it('keeps local deletions when removing other resources', async () => {
        // Arrange
        const show = await Show.create({ name: 'Breaking Bad' });
        const documentUrl = show.requireDocumentUrl();

        await markAsSynced(show);

        const season = await show.relatedSeasons.create({});
        const showSubjects = (await engine.readDocument(documentUrl))
            .getQuads()
            .map((quad) => quad.subject.value)
            .filter((subject) => !subject.startsWith(season.requireUrl()));

        await engine.updateDocument(
            documentUrl,
            arrayUnique(showSubjects).map((subject) => new DeleteResourceOperation(subject)),
            {
                localChanges: (changes) => ({
                    resources: { ...changes?.resources, [show.url]: { deletedAt: new Date() } },
                }),
            },
        );

        // Act
        await season.delete();

        // Assert
        const rawDocument = await engine.readDocumentIfExists(documentUrl, { includeEmptyDocuments: true });

        expect(rawDocument?.getQuads()).toHaveLength(0);
        expect(await engine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [show.url]: { deletedAt: expect.any(Date) } },
        });
    });

    it('restores local deletions when creating models at the same url', async () => {
        // Arrange
        const action = await WatchAction.create({
            startTime: new Date(),
            objectUrl: 'https://example.com/movie#it',
        });
        const documentUrl = action.requireDocumentUrl();

        await markAsSynced(action);
        await action.delete();

        vi.advanceTimersByTime(1000);

        // Act
        const restored = await WatchAction.create({ url: action.url, startTime: new Date() });

        // Assert
        const localChanges = await engine.getDocumentLocalChanges(documentUrl);
        const operations = restored.operations ?? [];

        expect(localChanges).toEqual({
            resources: {
                [action.url]: { newOperations: operations.map((operation) => operation.url) },
            },
        });
        expect(operations.map((operation) => operation.static().modelName).sort()).toEqual([
            'SetPropertyOperation',
            'SetPropertyOperation',
            'UnsetPropertyOperation',
        ]);
        expect(operations.every((operation) => operation.date.getTime() === Date.now())).toBe(true);
        expect(await engine.readDocumentIfExists(documentUrl)).not.toBeNull();
        expect((await WatchAction.find(action.url))?.objectUrl).toBeUndefined();
    });

    it('rejects restoring local deletions of models without history', async () => {
        // Arrange
        const movie = await Movie.create({
            url: 'https://example.com/movies/spirited-away#it',
            title: 'Spirited Away',
        });
        const documentUrl = movie.requireDocumentUrl();

        await markAsSynced(movie);
        await movie.delete();

        // Act
        const creating = Movie.create({ url: movie.url, title: 'Princess Mononoke' });

        // Assert
        await expect(creating).rejects.toThrow(SoukaiError);
        expect(await engine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [movie.url]: { deletedAt: expect.any(Date) } },
        });
    });

    it('allows updates on synced models without history in remote engines', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' }, { exists: true });

        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));
        movie.setDocumentExists(true);
        FakeServer.respond(documentUrl, FakeResponse.success());

        // Act
        await movie.update({ title: 'Princess Mononoke' });

        // Assert
        expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
    });

    async function markAsSynced(model: Model): Promise<void> {
        await engine.updateDocument(model.requireDocumentUrl(), [], { localChanges: () => null });
    }
});
