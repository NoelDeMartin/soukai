import { tracksLocalChanges } from 'soukai-bis/models/local-changes';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import SyncSession from './SyncSession';
import type { SyncProperties } from './SyncSession';
import FakeSyncStorageProvider from './testing/FakeSyncStorageProvider';
import FakeUserProfileManager from './testing/FakeUserProfileManager';
import { connect, fakeSyncJob, postContainerUrls, properties, session } from './testing/helpers';

describe('Sync', () => {
    beforeEach(() => Sync.boot({ storageProvider: new FakeSyncStorageProvider() }));

    it('discovers models in default containers without saved containers', async () => {
        // Act
        await Sync.boot({
            storageProvider: new FakeSyncStorageProvider(),
            models: [{ model: Post, registration: true }],
        });

        // Assert
        expect(Sync.getDiscoveryUrls(Post)).toEqual([Post.defaultContainerUrl]);
    });

    it('fails connecting before booting', async () => {
        // Arrange
        Sync.reset();

        // Act & Assert
        await expect(Sync.connect({ profileManager: new FakeUserProfileManager(), online: true })).rejects.toThrow(
            /hasn't been booted/,
        );
    });

    it('restores saved containers when booting after setup', async () => {
        // Arrange
        const onContainersUpdated = vi.fn();
        const containerUrls = { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) };

        Sync.listeners.add({ onContainersUpdated });

        // Act
        await Sync.boot({
            storageProvider: new FakeSyncStorageProvider({ setupCompleted: true, containerUrls }),
            models: [{ model: Post, registration: true }],
        });

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/blog/']);
        expect(onContainersUpdated).not.toHaveBeenCalled();
        expect(tracksLocalChanges(Post)).toBe(true);
        expect(Sync.models).toEqual([{ model: Post, registration: true }]);
    });

    it('restores saved discovery containers when booting before setup', async () => {
        // Arrange
        const defaultContainerUrl = Post.defaultContainerUrl;
        const containerUrls = { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) };

        // Act
        await Sync.boot({
            storageProvider: new FakeSyncStorageProvider({ containerUrls }),
            models: [{ model: Post, registration: true }],
        });

        // Assert
        expect(Post.defaultContainerUrl).toEqual(defaultContainerUrl);
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/blog/']);
        expect(tracksLocalChanges(Post)).toBe(false);
    });

    it('tracks local changes before connecting', async () => {
        // Arrange
        Sync.trackLocalChanges([Post, PostsCollection]);

        await Post.create({ title: 'Offline' });

        vi.advanceTimersByTime(1000);

        await PostsCollection.create({ name: 'Offline' });

        // Act
        await connect({ models: [{ model: Post, registration: false }] });

        // Assert
        expect(properties.localChangesCount).toBe(2);
    });

    it('notifies listeners about sessions', async () => {
        // Arrange
        const events: string[] = [];

        Sync.listeners.add({
            onSessionStarted: () => events.push('started'),
            onUpdated: (changes) => changes.connected !== undefined && events.push(`connected: ${changes.connected}`),
            onSessionEnded: () => events.push('ended'),
        });

        // Act
        await connect();
        await session.disconnect();

        // Assert
        expect(events).toEqual(['started', 'connected: true', 'ended', 'connected: false']);
        expect(properties.connected).toBe(false);
    });

    it('cleans up failed connections', async () => {
        // Arrange
        const error = new Error('Listener failed');
        const onUpdated = vi.fn((changes: Partial<SyncProperties>) => {
            if (changes.connected) {
                throw error;
            }
        });

        // Act
        const connecting = Sync.connect({
            profileManager: new FakeUserProfileManager(),
            online: true,
            onUpdated,
        });

        // Assert
        await expect(connecting).rejects.toThrow(error);
        expect(Sync.session).toBeNull();
        expect(onUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));
        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });

    it('cleans up connections with failed session listeners', async () => {
        // Arrange
        const error = new Error('Listener failed');
        const onSessionEnded = vi.fn();
        const stopListening = Sync.listeners.add({
            onSessionStarted: () => {
                throw error;
            },
            onSessionEnded,
        });

        // Act
        const connecting = Sync.connect({
            profileManager: new FakeUserProfileManager(),
            online: true,
        });

        // Assert
        await expect(connecting).rejects.toThrow(error);
        expect(Sync.session).toBeNull();
        expect(onSessionEnded).toHaveBeenCalledOnce();

        stopListening();

        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });

    it('fails connecting twice', async () => {
        // Arrange
        await connect();

        // Act & Assert
        await expect(Sync.connect({ profileManager: new FakeUserProfileManager(), online: true })).rejects.toThrow(
            /running session/,
        );
    });

    it('ignores previous sessions after reconnecting', async () => {
        // Arrange
        const onRun = vi.fn();

        fakeSyncJob({ onRun });

        const previousSession = await connect();

        await previousSession.disconnect();
        await connect();

        // Act
        previousSession.setOnline(false);
        await previousSession.synchronize();

        // Assert
        expect(Sync.session).toBe(session);
        expect(session.online).toBe(true);
        expect(properties.online).toBe(true);
        expect(onRun).not.toHaveBeenCalled();
    });

    it('fails connecting while previous sessions are disconnecting', async () => {
        // Arrange
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

        const previousSession = await connect();
        const syncing = previousSession.synchronize();

        await syncStarted;

        const disconnected = previousSession.disconnect();

        // Act
        const connecting = Sync.connect({
            profileManager: new FakeUserProfileManager(),
            online: true,
        });

        // Assert
        await expect(connecting).rejects.toThrow(/running session/);
        expect(previousSession.connected).toBe(true);
        expect(previousSession.disconnecting).toBe(true);
        expect(previousSession.isActive()).toBe(false);
        expect(Sync.session).toBe(previousSession);

        resumeSync();

        await Promise.all([syncing, disconnected]);

        expect(previousSession.connected).toBe(false);
        expect(previousSession.disconnecting).toBe(false);
        expect(Sync.session).toBeNull();
        await expect(
            Sync.connect({
                profileManager: new FakeUserProfileManager(),
                online: true,
            }),
        ).resolves.toBeInstanceOf(SyncSession);
    });

    it('allows reconnecting when notified of disconnections', async () => {
        // Arrange
        let reconnecting: Promise<SyncSession> | null = null;

        await connect({
            onUpdated: (changes) => {
                if (changes.connected !== false) {
                    return;
                }

                reconnecting = Sync.connect({
                    profileManager: new FakeUserProfileManager(),
                    online: true,
                });
            },
        });

        // Act
        await session.disconnect();

        // Assert
        await expect(reconnecting).resolves.toBeInstanceOf(SyncSession);
        expect(Sync.session?.isActive()).toBe(true);
    });

    it('disconnects connections in progress', async () => {
        // Arrange
        const onUpdated = vi.fn();
        const connecting = Sync.connect({ profileManager: new FakeUserProfileManager(), online: true, onUpdated });

        // Act
        await Sync.session?.disconnect();

        const session = await connecting;

        // Assert
        expect(session.connected).toBe(false);
        expect(session.disconnecting).toBe(false);
        expect(Sync.session).toBeNull();
        expect(onUpdated).not.toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });
});
