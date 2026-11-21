import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, it, vi } from 'vite-plus/test';

import { connect, fakeSyncJob, postContainerUrls, properties, session } from './testing/helpers';

describe('SyncSession local changes', () => {
    it('counts local changes in registered containers', async () => {
        // Arrange
        await connect({
            models: [
                { model: PostsCollection, registration: true },
                { model: Post, registration: false },
            ],
        });

        const collection = await PostsCollection.create({ name: 'Drafts' });

        vi.advanceTimersByTime(1000);

        await collection.relatedPosts.create({ title: 'Hello' });

        // Act
        await session.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(2);
    });

    it('ignores local changes of models deleted before syncing', async () => {
        // Arrange
        await connect({ models: [{ model: Post, registration: false }] });

        const post = await Post.create({ title: 'Hello' });

        await post.delete();

        // Act
        await session.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(0);
    });

    it('counts local changes', async () => {
        // Arrange
        await connect({ models: [{ model: Post, registration: false }] });

        const first = await Post.create({ title: 'First' });

        vi.advanceTimersByTime(1000);

        await Post.create({ title: 'Second' });
        await session.refreshLocalChanges();

        expect(properties.localChangesCount).toBe(2);

        // Act
        await first.delete();
        await session.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(1);
    });

    it('pushes local changes automatically', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            autoPush: true,
            models: [{ model: Post, registration: true }],
        });

        const synchronize = vi.spyOn(session, 'synchronize');

        vi.useFakeTimers();

        // Act
        await Post.create({ title: 'Hello' });
        await session.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(synchronize).toHaveBeenCalledOnce();
    });

    it('does not push local changes left by the previous sync', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            autoPush: true,
            models: [{ model: Post, registration: true }],
        });

        vi.useFakeTimers();

        await Post.create({ title: 'Unsynced' });
        await session.synchronize();

        const synchronize = vi.spyOn(session, 'synchronize');

        // Act
        await session.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        const syncsWithoutNewChanges = synchronize.mock.calls.length;

        await Post.create({ title: 'New' });
        await session.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(syncsWithoutNewChanges).toBe(0);
        expect(synchronize).toHaveBeenCalledOnce();
    });

    it('does not update local changes after disconnecting', async () => {
        // Arrange
        const changeset: LocalChangeset = { date: new Date(), modifiedDocumentResources: {} };
        let disconnected!: Promise<void>;

        await connect();

        vi.spyOn(requireLocalEngine(), 'getLocalChangesets').mockImplementationOnce(async () => {
            disconnected = session.disconnect();

            return [changeset];
        });

        // Act
        await session.refreshLocalChanges();
        await disconnected;

        // Assert
        expect(session.connected).toBe(false);
        expect(session.localChangesCount).toBe(0);
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

        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });

        // Act
        await session.synchronize();

        // Assert
        expect(runs).toBe(2);
    });

    it('does not sync again when local changes could not be synced', async () => {
        // Arrange
        let runs = 0;

        fakeSyncJob({ onRun: () => runs++ });

        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });
        await Post.create({ title: 'Unsynced' });

        // Act
        await session.synchronize();

        // Assert
        expect(runs).toBe(1);
    });
});
