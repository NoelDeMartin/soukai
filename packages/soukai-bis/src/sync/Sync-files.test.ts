import { requireLocalEngine } from 'soukai-bis/engines/state';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import { connect, fakeSyncJob, properties } from './testing/helpers';

describe('Sync files', () => {
    const url = 'https://alice.example/posts/image.png';

    it('forwards pushed files', async () => {
        // Arrange
        const blob = new Blob(['image'], { type: 'image/png' });
        const onFilePushed = vi.fn();
        const onFileUpdated = vi.fn();

        fakeSyncJob({ pushedFiles: [{ url, blob }] });

        await connect({ onFilePushed, onFileUpdated });

        // Act
        await Sync.start();

        // Assert
        expect(onFilePushed).toHaveBeenCalledWith({ url, blob });
        expect(onFileUpdated).not.toHaveBeenCalled();
    });

    it('notifies files updated during sync', async () => {
        // Arrange
        const onFileUpdated = vi.fn();

        fakeSyncJob({ syncedFileUrls: [url] });

        await connect({ onFileUpdated });

        // Act
        await Sync.start();

        // Assert
        expect(onFileUpdated).toHaveBeenCalledWith(url);
    });

    it('notifies files updated when disconnecting during sync', async () => {
        // Arrange
        const onFileUpdated = vi.fn();
        let disconnected!: Promise<void>;

        fakeSyncJob({ syncedFileUrls: [url], onRun: () => void (disconnected = Sync.disconnect()) });

        await connect({ onFileUpdated });

        // Act
        await Sync.start();
        await disconnected;

        // Assert
        expect(onFileUpdated).toHaveBeenCalledWith(url);
    });

    it('tracks local file changes', async () => {
        // Arrange
        await connect();

        // Act
        await requireLocalEngine().writeFile(url, new Blob(['image']), {
            localChanges: () => ({ resources: { [url]: { createdAt: new Date() } } }),
        });
        await Sync.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(1);
    });

    it('forgets local file changes that were discarded', async () => {
        // Arrange
        await connect();
        await requireLocalEngine().writeFile(url, new Blob(['image']), {
            localChanges: () => ({ resources: { [url]: { createdAt: new Date() } } }),
        });
        await Sync.refreshLocalChanges();

        expect(properties.localChangesCount).toBe(1);

        // Act
        await requireLocalEngine().deleteFile(url);
        await Sync.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(0);
    });
});
