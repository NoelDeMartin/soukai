import { InMemoryStorageService, Storage } from '@noeldemartin/utils';
import Sync from 'soukai-bis/sync/Sync';
import Post from 'soukai-bis/testing/stubs/Post';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import LocalStorageSyncStorageProvider from './LocalStorageSyncStorageProvider';

describe('LocalStorageSyncStorageProvider', () => {
    let storage: InMemoryStorageService;

    beforeEach(() => {
        storage = Storage.setInstance(new InMemoryStorageService()) as InMemoryStorageService;
    });

    it('returns defaults when empty', () => {
        // Arrange
        const provider = new LocalStorageSyncStorageProvider();

        // Assert
        expect(provider.getSetupCompleted()).toBe(false);
        expect(provider.getContainerUrls()).toEqual({});
        expect(provider.getExternalSources()).toEqual([]);
    });

    it('persists state', () => {
        // Arrange
        const containerUrls = {
            Post: { default: 'https://alice.example/posts/', registered: [], unlisted: [], instances: [] },
        };
        const provider = new LocalStorageSyncStorageProvider();

        // Act
        provider.setSetupCompleted(true);
        provider.setContainerUrls(containerUrls);
        provider.setExternalSources([{ containerUrl: 'https://bob.example/posts/', models: [Post] }]);

        // Assert
        const restoredProvider = new LocalStorageSyncStorageProvider();

        expect([...storage.items.keys()].sort()).toEqual([
            'soukai-sync:containerUrls',
            'soukai-sync:externalSources',
            'soukai-sync:setupCompleted',
        ]);
        expect(restoredProvider.getSetupCompleted()).toBe(true);
        expect(restoredProvider.getContainerUrls()).toEqual(containerUrls);
        expect(restoredProvider.getExternalSources()).toEqual([
            { containerUrl: 'https://bob.example/posts/', models: [Post] },
        ]);
    });

    it('uses custom namespaces', () => {
        // Arrange
        const provider = new LocalStorageSyncStorageProvider({ namespace: 'my-app' });

        // Act
        provider.setSetupCompleted(true);

        // Assert
        expect([...storage.items.keys()]).toEqual(['my-app:setupCompleted']);
        expect(new LocalStorageSyncStorageProvider().getSetupCompleted()).toBe(false);
    });

    it('ignores corrupted state', () => {
        // Arrange
        storage.items.set('soukai-sync:setupCompleted', '{not json');

        const provider = new LocalStorageSyncStorageProvider();

        // Assert
        expect(provider.getSetupCompleted()).toBe(false);
    });

    it('ignores state with unexpected shapes', () => {
        // Arrange
        const provider = new LocalStorageSyncStorageProvider();

        Storage.set('soukai-sync:setupCompleted', 'yes');
        Storage.set('soukai-sync:containerUrls', null);

        // Assert
        expect(provider.getSetupCompleted()).toBe(false);
        expect(provider.getContainerUrls()).toEqual({});
    });

    it('ignores external sources with unexpected shapes', () => {
        // Arrange
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const provider = new LocalStorageSyncStorageProvider();

        // Act
        Storage.set('soukai-sync:externalSources', {});

        const objectSources = provider.getExternalSources();

        Storage.set('soukai-sync:externalSources', [null]);

        const nullSources = provider.getExternalSources();

        // Assert
        expect(objectSources).toEqual([]);
        expect(nullSources).toEqual([]);
    });

    it('ignores external sources with models that are not booted', () => {
        // Arrange
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        Storage.set('soukai-sync:externalSources', [
            { containerUrl: 'https://bob.example/posts/', modelNames: ['Post'] },
            { containerUrl: 'https://bob.example/other/', modelNames: ['Unknown'] },
        ]);

        const provider = new LocalStorageSyncStorageProvider();

        // Act
        const externalSources = provider.getExternalSources();

        // Assert
        expect(externalSources).toEqual([{ containerUrl: 'https://bob.example/posts/', models: [Post] }]);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('boots sync', async () => {
        // Arrange
        const provider = new LocalStorageSyncStorageProvider();

        provider.setSetupCompleted(true);
        provider.setExternalSources([{ containerUrl: 'https://bob.example/posts/', models: [Post] }]);

        // Act
        await Sync.boot({ storageProvider: provider, models: [{ model: Post, registration: true }] });

        // Assert
        expect(Sync.setupCompleted).toBe(true);
        expect(Sync.externalSources).toEqual([{ containerUrl: 'https://bob.example/posts/', models: [Post] }]);
    });
});
