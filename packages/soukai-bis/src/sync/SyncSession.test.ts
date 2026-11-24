import { after } from '@noeldemartin/utils';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type { DeletionConflict, FileConflict, SyncApplicationModel, SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import { tracksLocalChanges } from 'soukai-bis/models/local-changes';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import type { ModelContainerUrls, SyncSessionConfig } from './SyncSession';
import FakeSyncStorageProvider from './testing/FakeSyncStorageProvider';
import FakeUserProfileManager from './testing/FakeUserProfileManager';
import { connect, fakeSyncJob, postContainerUrls, properties, session, user } from './testing/helpers';

describe('SyncSession', () => {
    it('passes synced models, type index creation and conflict resolvers to sync jobs', async () => {
        // Arrange
        let config!: SyncJobConfig;
        const profileManager = new FakeUserProfileManager();
        const resolveDeletionConflict = vi.fn();
        const resolveFileConflict = vi.fn();

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect({
            profileManager,
            resolveDeletionConflict,
            resolveFileConflict,
            models: [
                { model: Post, registration: { public: true } },
                { model: PostsCollection, registration: { mode: 'instance' } },
            ],
        });

        // Act
        await session.synchronize();

        // Assert
        const deletionConflict = { url: 'https://alice.example/posts/1' } as unknown as DeletionConflict;
        const fileConflict = { url: 'https://alice.example/posts/image.png' } as unknown as FileConflict;

        await config.resolveDeletionConflict?.(deletionConflict);
        await config.resolveFileConflict?.(fileConflict);
        await config.createPublicTypeIndex?.();
        await config.createPrivateTypeIndex?.();

        expect(config).toMatchObject({
            userProfile: user,
            applicationModels: [
                { model: Post, registration: { public: true } },
                { model: PostsCollection, registration: { mode: 'instance' } },
            ],
        });
        expect(resolveDeletionConflict).toHaveBeenCalledWith(deletionConflict);
        expect(resolveFileConflict).toHaveBeenCalledWith(fileConflict);
        expect(profileManager.createPublicTypeIndex).toHaveBeenCalledOnce();
        expect(profileManager.createPrivateTypeIndex).toHaveBeenCalledOnce();
    });

    it('notifies profile managers when profiles are updated', async () => {
        // Arrange
        const profileManager = new FakeUserProfileManager();

        fakeSyncJob({ updatedProfile: user });

        await connect({ profileManager });

        // Act
        await session.synchronize();

        // Assert
        expect(profileManager.onProfileUpdated).toHaveBeenCalledWith(user);
    });

    it('uses the user profile when the profile manager is missing', async () => {
        // Arrange
        let config!: SyncJobConfig;
        const profile = { ...user, name: 'Alice' };

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect({ user: profile });

        // Act
        await session.synchronize();

        // Assert
        expect(config.userProfile).toBe(profile);
    });

    it('requires a user or a profile manager at the type level', () => {
        expectTypeOf<{ online: true; user: typeof user }>().toExtend<SyncSessionConfig>();
        expectTypeOf<{ online: true; profileManager: FakeUserProfileManager }>().toExtend<SyncSessionConfig>();
        expectTypeOf<{ online: true }>().not.toExtend<SyncSessionConfig>();
        expectTypeOf<{
            online: true;
            user: typeof user;
            profileManager: FakeUserProfileManager;
        }>().not.toExtend<SyncSessionConfig>();
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
        await session.synchronize();

        // Assert
        expect(onSyncFailed).toHaveBeenCalledWith(error);
        expect(properties.error).toBe(error);
        expect(session.syncing).toBe(false);
    });

    it('keeps the offline status when syncs fail', async () => {
        // Arrange
        fakeSyncJob({
            onRun: (job) => {
                job.completed.catch(() => null);

                session.setOnline(false);

                throw new Error('Network error');
            },
        });

        await connect();

        // Act
        await session.synchronize();

        // Assert
        expect(session.online).toBe(false);
        expect(properties.online).toBe(false);
    });

    it('uses the navigator online status by default', async () => {
        // Arrange
        vi.stubGlobal('navigator', { onLine: false });

        // Act
        await connect({ online: undefined });

        // Assert
        expect(session.online).toBe(false);
    });

    it('is online by default without a navigator', async () => {
        // Arrange
        vi.stubGlobal('navigator', undefined);

        // Act
        await connect({ online: undefined });

        // Assert
        expect(session.online).toBe(true);
    });

    it('updates the online status', async () => {
        // Arrange
        const onRun = vi.fn();
        const onUpdated = vi.fn();

        fakeSyncJob({ onRun });

        await connect({ onUpdated });

        // Act
        session.setOnline(false);

        await session.synchronize();

        // Assert
        expect(session.online).toBe(false);
        expect(onUpdated).toHaveBeenLastCalledWith({ online: false });
        expect(onRun).not.toHaveBeenCalled();
    });

    it('copies the config when connecting', async () => {
        // Arrange
        const source = { containerUrl: 'https://bob.example/posts/', models: [Post] };
        const config = {
            online: true,
            models: [{ model: Post, registration: true }] as SyncApplicationModel[],
            containerUrls: { Post: postContainerUrls() } as Record<string, ModelContainerUrls>,
            externalSources: [] as ExternalSource[],
        };

        await connect(config);

        // Act
        config.online = false;
        config.models.push({ model: PostsCollection, registration: true });
        config.containerUrls.PostsCollection = postContainerUrls();
        config.externalSources.push(source);

        // Assert
        expect(session.online).toBe(true);
        expect(session.requireRemoteContainerUrl(Post)).toEqual('https://alice.example/posts/');
        expect(() => session.requireRemoteContainerUrl(PostsCollection)).toThrow(/Failed resolving/);
        expect(Sync.containerUrls).toEqual({ Post: postContainerUrls() });
        expect(Sync.externalSources).toEqual([]);
        expect(Sync.hasExternalSource(source)).toBe(false);
    });

    it('reads the latest user profile', async () => {
        // Arrange
        let config: SyncJobConfig | null = null;
        const profileManager = new FakeUserProfileManager();
        const updatedUser = { ...user, name: 'Alice' };

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect({ profileManager });

        // Act
        profileManager.profile = updatedUser;

        await session.synchronize();

        // Assert
        expect(config).toMatchObject({ userProfile: updatedUser });
    });

    it('updates auto push', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            autoPush: false,
            models: [{ model: Post, registration: true }],
        });

        const synchronize = vi.spyOn(session, 'synchronize');

        vi.useFakeTimers();

        // Act
        session.setAutoPush(true);

        await Post.create({ title: 'Hello' });
        await session.refreshLocalChanges();
        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(synchronize).toHaveBeenCalledOnce();
    });

    it('cancels pending pushes when disabling auto push', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            autoPush: true,
            models: [{ model: Post, registration: true }],
        });

        const synchronize = vi.spyOn(session, 'synchronize');

        vi.useFakeTimers();

        await Post.create({ title: 'Hello' });
        await session.refreshLocalChanges();

        // Act
        session.setAutoPush(false);

        await vi.advanceTimersByTimeAsync(1000);

        // Assert
        expect(synchronize).not.toHaveBeenCalled();
    });

    it('stays inert after disconnecting', async () => {
        // Arrange
        const onUpdated = vi.fn();
        const onContainersUpdated = vi.fn();

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            autoPush: true,
            onUpdated,
            onContainersUpdated,
            models: [{ model: Post, registration: true }],
        });

        const synchronize = vi.spyOn(session, 'synchronize');

        await session.disconnect();

        onUpdated.mockClear();
        onContainersUpdated.mockClear();

        // Act
        session.setOnline(true);
        await new Post({ title: 'Elsewhere' }).save({ containerUrl: 'https://alice.example/blog/' });
        await session.refreshLocalChanges();
        await session.synchronize();

        // Assert
        expect(onUpdated).not.toHaveBeenCalled();
        expect(onContainersUpdated).not.toHaveBeenCalled();
        expect(synchronize).toHaveBeenCalledOnce();
        expect(Sync.session).toBeNull();
    });

    it('resets state when disconnecting', async () => {
        // Arrange
        const localContainerUrl = Post.defaultContainerUrl;
        const source = { containerUrl: 'https://bob.example/posts/', models: [Post] };
        const storageProvider = new FakeSyncStorageProvider({
            setupCompleted: true,
            containerUrls: { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) },
            externalSources: [source],
        });

        const onContainersUpdated = vi.fn();

        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        const remoteContainerUrl = Post.defaultContainerUrl;

        Sync.listeners.add({ onContainersUpdated });

        // Act
        await session.disconnect({ reset: true });

        // Assert
        expect(onContainersUpdated).toHaveBeenCalledWith(Post, [localContainerUrl]);
        expect(tracksLocalChanges(Post)).toBe(false);
        expect(remoteContainerUrl).toEqual('https://alice.example/blog/');
        expect(Post.defaultContainerUrl).toEqual(localContainerUrl);
        expect(Sync.setupCompleted).toBe(false);
        expect(Sync.containerUrls).toEqual({});
        expect(Sync.externalSources).toEqual([]);
        expect(storageProvider.setupCompleted).toBe(false);
        expect(storageProvider.containerUrls).toEqual({});
        expect(storageProvider.externalSources).toEqual([]);
    });

    it('does not reset state from stale sessions', async () => {
        // Arrange
        const storageProvider = new FakeSyncStorageProvider({
            setupCompleted: true,
            containerUrls: { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) },
        });

        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        const staleSession = session;

        await staleSession.disconnect();
        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        // Act
        await staleSession.disconnect({ reset: true });

        // Assert
        expect(Sync.session).toBe(session);
        expect(Sync.setupCompleted).toBe(true);
        expect(storageProvider.setupCompleted).toBe(true);
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('does not reset state from stale sessions after newer sessions disconnect', async () => {
        // Arrange
        const storageProvider = new FakeSyncStorageProvider({
            setupCompleted: true,
            containerUrls: { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) },
        });

        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        const staleSession = session;

        await staleSession.disconnect();
        await connect({ storageProvider, models: [{ model: Post, registration: true }] });
        await session.disconnect();

        // Act
        await staleSession.disconnect({ reset: true });

        // Assert
        expect(Sync.session).toBeNull();
        expect(Sync.setupCompleted).toBe(true);
        expect(storageProvider.setupCompleted).toBe(true);
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('resets state before ending sessions', async () => {
        // Arrange
        let setupCompletedWhenEnded: boolean | null = null;
        const storageProvider = new FakeSyncStorageProvider({ setupCompleted: true });

        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        Sync.listeners.add({ onSessionEnded: () => (setupCompletedWhenEnded = Sync.setupCompleted) });

        // Act
        await session.disconnect({ reset: true });

        // Assert
        expect(setupCompletedWhenEnded).toBe(false);
    });

    it('keeps state when disconnecting', async () => {
        // Arrange
        const storageProvider = new FakeSyncStorageProvider({
            setupCompleted: true,
            containerUrls: { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) },
        });

        await connect({ storageProvider, models: [{ model: Post, registration: true }] });

        // Act
        await session.disconnect();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(Sync.setupCompleted).toBe(true);
        expect(storageProvider.setupCompleted).toBe(true);
        expect(storageProvider.containerUrls.Post?.default).toEqual('https://alice.example/blog/');
    });

    it('finishes disconnecting after running syncs', async () => {
        // Arrange
        const events: string[] = [];
        let resumeSync!: () => void;
        let jobStarted!: () => void;
        const syncPaused = new Promise<void>((resolve) => (resumeSync = resolve));
        const syncStarted = new Promise<void>((resolve) => (jobStarted = resolve));

        fakeSyncJob({
            onRun: () => {
                jobStarted();

                return syncPaused;
            },
        });

        await connect({ onSyncCompleted: () => events.push('sync-completed') });

        const syncing = session.synchronize();

        await syncStarted;

        // Act
        const disconnected = session.disconnect().then(() => events.push('disconnected'));

        await after({ milliseconds: 10 });

        events.push('resumed');
        resumeSync();

        await Promise.all([syncing, disconnected]);

        // Assert
        expect(events).toEqual(['resumed', 'sync-completed', 'disconnected']);
    });

    it('finishes disconnecting after refreshing local changes', async () => {
        // Arrange
        const events: string[] = [];
        let resumeRefresh!: () => void;
        const refreshPaused = new Promise<void>((resolve) => (resumeRefresh = resolve));

        await connect();

        vi.spyOn(requireLocalEngine(), 'getLocalChangesets').mockImplementationOnce(async () => {
            await refreshPaused;

            events.push('refreshed');

            return [];
        });

        const refreshing = session.refreshLocalChanges();

        // Act
        const disconnected = session.disconnect().then(() => events.push('disconnected'));

        await after({ milliseconds: 10 });

        events.push('resumed');
        resumeRefresh();

        await Promise.all([refreshing, disconnected]);

        // Assert
        expect(events).toEqual(['resumed', 'refreshed', 'disconnected']);
    });

    it('notifies sync listeners', async () => {
        // Arrange
        const onSyncCompleted = vi.fn();

        fakeSyncJob();

        await connect({ onSyncCompleted });

        // Act
        await session.synchronize();

        // Assert
        expect(onSyncCompleted).toHaveBeenCalledWith({ cancelled: false, error: null });
    });

    it('only updates connection properties when disconnecting', async () => {
        // Arrange
        const onUpdated = vi.fn();

        await connect({ containerUrls: { Post: postContainerUrls() }, onUpdated });

        onUpdated.mockClear();

        // Act
        await session.disconnect();

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

    it('does not start jobs after disconnecting', async () => {
        // Arrange
        const onRun = vi.fn();
        let disconnected!: Promise<void>;

        fakeSyncJob({ onRun });

        await connect({
            findTypeIndexes: async () => {
                disconnected = session.disconnect();

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
        });

        // Act
        await session.synchronize();
        await disconnected;

        // Assert
        expect(onRun).not.toHaveBeenCalled();
        expect(session.connected).toBe(false);
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
        await session.synchronize();

        // Assert
        expect(runningJob).not.toBeNull();
        expect(activeJob).toBe(runningJob);
        expect(session.activeJob).toBeNull();
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
                    disconnected = session.disconnect();
                }

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();
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
                disconnected = session.disconnect();
            },
        });

        await connect({
            containerUrls: { Post: postContainerUrls() },
            onSyncCompleted: () => events.push('sync-completed'),
            onUpdated: (changes) => changes.connected === false && events.push('disconnected'),
        });

        // Act
        await session.synchronize();
        await disconnected;

        // Assert
        expect(cancel).toHaveBeenCalled();
        expect(events).toEqual(['sync-completed', 'disconnected']);
        expect(session.connected).toBe(false);
    });
});
