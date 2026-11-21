import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import SyncSession from './SyncSession';
import type { SyncProperties } from './SyncSession';
import { FakeUserProfileManager, connect, fakeSyncJob, properties, session } from './testing/helpers';

describe('Sync', () => {
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

    it('cleans up failed connections', async () => {
        // Arrange
        const error = new Error('Listener failed');
        const onUpdated = vi.fn((changes: Partial<SyncProperties>) => {
            if (changes.connected) {
                throw error;
            }
        });

        // Act
        const connecting = Sync.connect({ profileManager: new FakeUserProfileManager(), online: true, onUpdated });

        // Assert
        await expect(connecting).rejects.toThrow(error);
        expect(Sync.session).toBeNull();
        expect(onUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));
        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });

    it('fails connecting twice', async () => {
        // Arrange
        await connect();

        // Act & Assert
        await expect(connect()).rejects.toThrow(/running session/);
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
        previousSession.addExternalSource({ containerUrl: 'https://bob.example/posts/', models: [Post] });
        await previousSession.synchronize();

        // Assert
        expect(Sync.session).toBe(session);
        expect(session.online).toBe(true);
        expect(properties.online).toBe(true);
        expect(session.externalSources).toEqual([]);
        expect(properties.externalSources).toEqual([]);
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
        const connecting = Sync.connect({ profileManager: new FakeUserProfileManager(), online: true });

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
            Sync.connect({ profileManager: new FakeUserProfileManager(), online: true }),
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

                reconnecting = Sync.connect({ profileManager: new FakeUserProfileManager(), online: true });
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
        const connecting = connect();

        // Act
        await Sync.session?.disconnect();
        await connecting;

        // Assert
        expect(session.connected).toBe(false);
        expect(session.disconnecting).toBe(false);
        expect(Sync.session).toBeNull();
        expect(properties.connected).toBeUndefined();
        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });
});
