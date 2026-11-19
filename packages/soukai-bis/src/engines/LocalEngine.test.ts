import { requireLocalEngine } from 'soukai-bis/engines/state';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import PlaylistWithHistory from 'soukai-bis/testing/stubs/PlaylistWithHistory';
import Song from 'soukai-bis/testing/stubs/Song';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

describe('LocalEngine.getLocalChangesets', () => {
    beforeEach(() => {
        trackLocalChanges(PlaylistWithHistory);
        trackLocalChanges(Song);
    });

    it('groups changes in multiple documents made together', async () => {
        // Arrange
        const engine = requireLocalEngine();
        const playlist = await PlaylistWithHistory.create({ name: 'Favorites' });
        const playlistCreatedAt = new Date();

        await playlist.loadRelationIfUnloaded('songs');

        vi.advanceTimersByTime(1000);
        Song.on('created', () => vi.advanceTimersByTime(1000));

        // Act
        const songCreatedAt = new Date();
        const song = await playlist.relatedSongs.create({ title: 'Hello' });
        const changesets = await engine.getLocalChangesets();

        // Assert
        expect(changesets).toEqual([
            {
                date: playlistCreatedAt,
                modifiedDocumentResources: { [playlist.requireDocumentUrl()]: [playlist.requireUrl()] },
            },
            {
                date: songCreatedAt,
                modifiedDocumentResources: {
                    [playlist.requireDocumentUrl()]: [playlist.requireUrl()],
                    [song.requireDocumentUrl()]: [song.requireUrl()],
                },
            },
        ]);
    });

    it('sorts changes made at different times', async () => {
        // Arrange
        const engine = requireLocalEngine();
        const playlist = await PlaylistWithHistory.create({ name: 'Favorites' });
        const modifiedDocumentResources = { [playlist.requireDocumentUrl()]: [playlist.requireUrl()] };

        await engine.updateDocument(playlist.requireDocumentUrl(), [], { localChanges: () => null });

        // Act
        vi.advanceTimersByTime(1000);
        const renamedAt = new Date();
        await playlist.update({ name: 'All-time favorites' });

        vi.advanceTimersByTime(1000);
        const restoredAt = new Date();
        await playlist.update({ name: 'Favorites' });

        // Assert
        await expect(engine.getLocalChangesets()).resolves.toEqual([
            { date: renamedAt, modifiedDocumentResources },
            { date: restoredAt, modifiedDocumentResources },
        ]);
    });

    it('reads documents only when their local changes are updated', async () => {
        // Arrange
        const engine = requireLocalEngine();
        const readDocument = vi.spyOn(engine, 'readDocumentIfExists');
        const playlist = await PlaylistWithHistory.create({ name: 'Favorites' });

        await engine.updateDocument(playlist.requireDocumentUrl(), [], { localChanges: () => null });

        vi.advanceTimersByTime(1000);
        await playlist.update({ name: 'All-time favorites' });

        readDocument.mockClear();

        // Act
        await engine.getLocalChangesets();
        await engine.getLocalChangesets();

        vi.advanceTimersByTime(1000);
        await playlist.update({ name: 'Favorites' });
        readDocument.mockClear();

        const changesets = await engine.getLocalChangesets();

        // Assert
        expect(changesets).toHaveLength(2);
        expect(readDocument).toHaveBeenCalledOnce();
    });

    it('forgets synchronized changes', async () => {
        // Arrange
        const engine = requireLocalEngine();
        const playlist = await PlaylistWithHistory.create({ name: 'Favorites' });

        await expect(engine.getLocalChangesets()).resolves.toHaveLength(1);

        // Act
        await engine.updateDocument(playlist.requireDocumentUrl(), [], { localChanges: () => null });

        // Assert
        await expect(engine.getLocalChangesets()).resolves.toEqual([]);
    });
});
