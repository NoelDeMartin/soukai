import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import { connect, fakeSyncJob, postContainerUrls, properties } from './testing/helpers';

describe('Sync local changes', () => {
    it('counts local changes in registered containers', async () => {
        // Arrange
        await connect();
        await Sync.trackModels([
            { model: PostsCollection, registration: true },
            { model: Post, registration: false },
        ]);

        const collection = await PostsCollection.create({ name: 'Drafts' });

        vi.advanceTimersByTime(1000);

        await collection.relatedPosts.create({ title: 'Hello' });

        // Act
        await Sync.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(2);
    });

    it('ignores local changes of models deleted before syncing', async () => {
        // Arrange
        await connect();
        await Sync.trackModels([{ model: Post, registration: false }]);

        const post = await Post.create({ title: 'Hello' });

        await post.delete();

        // Act
        await Sync.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(0);
    });

    it('counts local changes', async () => {
        // Arrange
        await connect();
        await Sync.trackModels([{ model: Post, registration: false }]);

        const first = await Post.create({ title: 'First' });

        vi.advanceTimersByTime(1000);

        await Post.create({ title: 'Second' });
        await Sync.refreshLocalChanges();

        expect(properties.localChangesCount).toBe(2);

        // Act
        await first.delete();
        await Sync.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(1);
    });

    it('pushes local changes automatically', async () => {
        // Arrange
        fakeSyncJob();

        await connect({ containerUrls: { Post: postContainerUrls() }, autoPush: true });
        await Sync.trackModels([{ model: Post, registration: true }]);

        const start = vi.spyOn(Sync.requireInstance(), 'start');

        vi.useFakeTimers();

        // Act
        await Post.create({ title: 'Hello' });
        await Sync.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(start).toHaveBeenCalledOnce();
    });

    it('does not push local changes left by the previous sync', async () => {
        // Arrange
        fakeSyncJob();

        await connect({ containerUrls: { Post: postContainerUrls() }, autoPush: true });
        await Sync.trackModels([{ model: Post, registration: true }]);

        vi.useFakeTimers();

        await Post.create({ title: 'Unsynced' });
        await Sync.start();

        const start = vi.spyOn(Sync.requireInstance(), 'start');

        // Act
        await Sync.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        const syncsWithoutNewChanges = start.mock.calls.length;

        await Post.create({ title: 'New' });
        await Sync.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(syncsWithoutNewChanges).toBe(0);
        expect(start).toHaveBeenCalledOnce();
    });

    it('does not update local changes after disconnecting', async () => {
        // Arrange
        const changeset: LocalChangeset = { date: new Date(), modifiedDocumentResources: {} };

        await connect();

        vi.spyOn(requireLocalEngine(), 'getLocalChangesets').mockImplementationOnce(async () => {
            await Sync.disconnect();

            return [changeset];
        });

        // Act
        await Sync.refreshLocalChanges();

        // Assert
        expect(Sync.connected).toBe(false);
        expect(Sync.localChangesCount).toBe(0);
    });

    it('syncs again when local changes are made during sync', async () => {
        // Arrange
        let runs = 0;
        let post: Post | null = null;

        fakeSyncJob({
            onRun: async () => {
                runs++;
                post ??= await Post.create({ title: 'During sync' });
            },
        });

        await connect({ containerUrls: { Post: postContainerUrls() } });
        await Sync.trackModels([{ model: Post, registration: true }]);

        // Act
        await Sync.start();

        // Assert
        expect(runs).toBe(2);
    });

    it('does not sync again when local changes could not be synced', async () => {
        // Arrange
        let runs = 0;

        fakeSyncJob({ onRun: () => runs++ });

        await connect({ containerUrls: { Post: postContainerUrls() } });
        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Unsynced' });

        // Act
        await Sync.start();

        // Assert
        expect(runs).toBe(1);
    });
});
