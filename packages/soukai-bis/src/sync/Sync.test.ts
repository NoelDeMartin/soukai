import type SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type { DeletionConflict, FileConflict, SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import { connect, fakeSyncJob, postContainerUrls, properties, user } from './testing/helpers';

describe('Sync', () => {
    it('passes synced models and conflict resolvers to sync jobs', async () => {
        // Arrange
        let config!: SyncJobConfig;
        const resolveDeletionConflict = vi.fn();
        const resolveFileConflict = vi.fn();

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect({ resolveDeletionConflict, resolveFileConflict });
        await Sync.trackModels([
            { model: Post, registration: { public: true } },
            { model: PostsCollection, registration: { mode: 'instance' } },
        ]);

        // Act
        await Sync.start();

        // Assert
        const deletionConflict = { url: 'https://alice.example/posts/1' } as unknown as DeletionConflict;
        const fileConflict = { url: 'https://alice.example/posts/image.png' } as unknown as FileConflict;

        await config.resolveDeletionConflict?.(deletionConflict);
        await config.resolveFileConflict?.(fileConflict);

        expect(config).toMatchObject({
            userProfile: user,
            applicationModels: [
                { model: Post, registration: { public: true } },
                { model: PostsCollection, registration: { mode: 'instance' } },
            ],
        });
        expect(resolveDeletionConflict).toHaveBeenCalledWith(deletionConflict);
        expect(resolveFileConflict).toHaveBeenCalledWith(fileConflict);
    });

    it('reports sync errors', async () => {
        // Arrange
        const error = new Error('Sync failed');
        const onSyncFailed = vi.fn();

        fakeSyncJob({
            onRun: (job) => {
                job.completed.catch(() => null);

                throw error;
            },
        });

        await connect({ onSyncFailed });

        // Act
        await Sync.start();

        // Assert
        expect(onSyncFailed).toHaveBeenCalledWith(error);
        expect(properties.error).toBe(error);
        expect(Sync.syncing).toBe(false);
    });

    it('keeps the offline status when syncs fail', async () => {
        // Arrange
        fakeSyncJob({
            onRun: (job) => {
                job.completed.catch(() => null);

                Sync.setOnline(false);

                throw new Error('Network error');
            },
        });

        await connect();

        // Act
        await Sync.start();

        // Assert
        expect(Sync.online).toBe(false);
        expect(properties.online).toBe(false);
    });

    it('updates the online status', async () => {
        // Arrange
        const onUpdated = vi.fn();

        await connect({ onUpdated });

        // Act
        Sync.setOnline(false);

        // Assert
        expect(Sync.online).toBe(false);
        expect(onUpdated).toHaveBeenLastCalledWith({ online: false });
    });

    it('updates the user profile', async () => {
        // Arrange
        let config: SyncJobConfig | null = null;
        const updatedUser = { ...user, name: 'Alice' };

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect();

        // Act
        Sync.setUserProfile(updatedUser);

        await Sync.start();

        // Assert
        expect(config).toMatchObject({ userProfile: updatedUser });
    });

    it('updates auto push', async () => {
        // Arrange
        fakeSyncJob();

        await connect({ containerUrls: { Post: postContainerUrls() }, autoPush: false });
        await Sync.trackModels([{ model: Post, registration: true }]);

        const start = vi.spyOn(Sync.requireInstance(), 'start');

        vi.useFakeTimers();

        // Act
        Sync.setAutoPush(true);

        await Post.create({ title: 'Hello' });
        await Sync.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(start).toHaveBeenCalledOnce();
    });

    it('cancels pending pushes when disabling auto push', async () => {
        // Arrange
        fakeSyncJob();

        await connect({ containerUrls: { Post: postContainerUrls() }, autoPush: true });
        await Sync.trackModels([{ model: Post, registration: true }]);

        const start = vi.spyOn(Sync.requireInstance(), 'start');

        vi.useFakeTimers();

        await Post.create({ title: 'Hello' });
        await Sync.refreshLocalChanges();

        // Act
        Sync.setAutoPush(false);

        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(start).not.toHaveBeenCalled();
    });

    it('stays inert after disconnecting', async () => {
        // Arrange
        const onUpdated = vi.fn();
        const onContainersUpdated = vi.fn();
        const start = vi.spyOn(Sync.requireInstance(), 'start');

        await connect({ containerUrls: { Post: postContainerUrls() }, onUpdated, onContainersUpdated });
        await Sync.disconnect();

        onUpdated.mockClear();

        // Act
        Sync.setOnline(true);
        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });
        await Sync.refreshLocalChanges();

        // Assert
        expect(onUpdated).not.toHaveBeenCalled();
        expect(onContainersUpdated).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        expect(() => Sync.addExternalSource({ containerUrl: 'https://bob.example/posts/', models: [Post] })).toThrow(
            /isn't connected/,
        );
    });

    it('notifies sync listeners', async () => {
        // Arrange
        const onSyncCompleted = vi.fn();

        fakeSyncJob();

        await connect({ onSyncCompleted });

        // Act
        await Sync.start();

        // Assert
        expect(onSyncCompleted).toHaveBeenCalledWith({ cancelled: false, error: null });
    });

    it('only updates connection properties when disconnecting', async () => {
        // Arrange
        const onUpdated = vi.fn();

        await connect({ containerUrls: { Post: postContainerUrls() }, onUpdated });

        onUpdated.mockClear();

        // Act
        await Sync.disconnect();

        // Assert
        expect(onUpdated).toHaveBeenCalledOnce();
        expect(onUpdated).toHaveBeenCalledWith({
            connected: false,
            online: false,
            syncing: false,
            localChangesCount: 0,
            error: null,
            activeJob: null,
        });
    });

    it('disconnects connections in progress', async () => {
        // Arrange
        const connecting = connect();

        // Act
        await Sync.disconnect();
        await connecting;

        // Assert
        expect(Sync.connected).toBe(false);
        expect(properties.connected).toBe(false);
        await expect(connect()).resolves.toBeUndefined();
    });

    it('does not start jobs after disconnecting', async () => {
        // Arrange
        const onRun = vi.fn();
        let disconnected!: Promise<void>;

        fakeSyncJob({ onRun });

        await connect({
            findTypeIndexes: async () => {
                disconnected = Sync.disconnect();

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
        });

        // Act
        await Sync.start();
        await disconnected;

        // Assert
        expect(onRun).not.toHaveBeenCalled();
        expect(Sync.connected).toBe(false);
    });

    it('tracks active jobs', async () => {
        // Arrange
        let runningJob: SyncJob | null = null;
        let activeJob: SyncJob | null | undefined;

        fakeSyncJob({
            onRun: (job) => {
                runningJob = job;
                activeJob = properties.activeJob;
            },
        });

        await connect();

        // Act
        await Sync.start();

        // Assert
        expect(runningJob).not.toBeNull();
        expect(activeJob).toBe(runningJob);
        expect(Sync.activeJob).toBeNull();
        expect(properties.activeJob).toBeNull();
    });

    it('does not cancel finished jobs when disconnecting', async () => {
        // Arrange
        const jobs: SyncJob[] = [];
        const onSyncCompleted = vi.fn();
        let typeIndexLookups = 0;
        let post: Post | null = null;
        let disconnected!: Promise<void>;

        fakeSyncJob({
            onRun: async (job) => {
                jobs.push(job);
                vi.spyOn(job, 'cancel');

                post ??= await Post.create({ title: 'During sync' });
            },
        });

        await connect({
            containerUrls: { Post: postContainerUrls() },
            onSyncCompleted,
            findTypeIndexes: async () => {
                if (++typeIndexLookups === 2) {
                    disconnected = Sync.disconnect();
                }

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
        });
        await Sync.trackModels([{ model: Post, registration: true }]);

        // Act
        await Sync.start();
        await disconnected;

        // Assert
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.cancel).not.toHaveBeenCalled();
        expect(onSyncCompleted).toHaveBeenCalledWith({ cancelled: true, error: null });
    });

    it('cancels running syncs when disconnecting', async () => {
        // Arrange
        const events: string[] = [];
        let cancel!: () => Promise<void>;
        let disconnected!: Promise<void>;

        fakeSyncJob({
            onRun: (job) => {
                cancel = vi.spyOn(job, 'cancel');
                disconnected = Sync.disconnect();
            },
        });

        await connect({
            containerUrls: { Post: postContainerUrls() },
            onSyncCompleted: () => events.push('sync-completed'),
            onUpdated: (changes) => changes.connected === false && events.push('disconnected'),
        });

        // Act
        await Sync.start();
        await disconnected;

        // Assert
        expect(cancel).toHaveBeenCalled();
        expect(events).toEqual(['sync-completed', 'disconnected']);
        expect(Sync.connected).toBe(false);
    });
});
