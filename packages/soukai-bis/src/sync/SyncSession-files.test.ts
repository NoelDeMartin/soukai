import { requireLocalEngine } from 'soukai-bis/engines/state';
import { describe, expect, it, vi } from 'vite-plus/test';

import { connect, fakeSyncJob, properties, session } from './testing/helpers';

describe('SyncSession files', () => {
    const url = 'https://alice.example/posts/image.png';

    it('forwards pushed files', async () => {
        // Arrange
        const blob = new Blob(['image'], { type: 'image/png' });
        const onFilePushed = vi.fn();
        const onFileUpdated = vi.fn();

        fakeSyncJob({ pushedFiles: [{ url, blob }] });

        await connect({ onFilePushed, onFileUpdated });

        // Act
        await session.synchronize();

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
        await session.synchronize();

        // Assert
        expect(onFileUpdated).toHaveBeenCalledWith(url);
    });

    it('notifies files updated when disconnecting during sync', async () => {
        // Arrange
        const onFileUpdated = vi.fn();
        let disconnected!: Promise<void>;

        fakeSyncJob({ syncedFileUrls: [url], onRun: () => void (disconnected = session.disconnect()) });

        await connect({ onFileUpdated });

        // Act
        await session.synchronize();
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
        await session.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(1);
    });

    it('forgets local file changes that were discarded', async () => {
        // Arrange
        await connect();
        await requireLocalEngine().writeFile(url, new Blob(['image']), {
            localChanges: () => ({ resources: { [url]: { createdAt: new Date() } } }),
        });
        await session.refreshLocalChanges();

        expect(properties.localChangesCount).toBe(1);

        // Act
        await requireLocalEngine().deleteFile(url);
        await session.refreshLocalChanges();

        // Assert
        expect(properties.localChangesCount).toBe(0);
    });
});
