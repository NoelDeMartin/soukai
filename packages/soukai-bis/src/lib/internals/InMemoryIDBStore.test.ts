import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import InMemoryIDBStore from './InMemoryIDBStore';
import SoukaiIndexedDB from './SoukaiIndexedDB';

describe('InMemoryIDBStore', () => {
    beforeEach(async () => {
        await SoukaiIndexedDB.clear();
    });

    afterEach(async () => {
        await SoukaiIndexedDB.close();
    });

    it('updates other stores', async () => {
        // Arrange
        const key: [string, string] = ['User', 'https://alice.example.org#me'];
        const mainStore = new InMemoryIDBStore('computedAttributes');
        const workerStore = new InMemoryIDBStore('computedAttributes');

        await mainStore.set(key, { model: 'User', url: 'https://alice.example.org#me', name: 'Alice' });
        await expect(workerStore.get(key)).resolves.toEqual(expect.objectContaining({ name: 'Alice' }));

        // Act
        await mainStore.set(key, { model: 'User', url: 'https://alice.example.org#me', name: 'Alicia' });

        // Assert
        await vi.waitFor(() =>
            expect(workerStore.get(key)).resolves.toEqual(expect.objectContaining({ name: 'Alicia' })),
        );
    });

    it('removes deleted entries from other stores', async () => {
        // Arrange
        const key: [string, string] = ['User', 'https://alice.example.org#me'];
        const mainStore = new InMemoryIDBStore('computedAttributes');
        const workerStore = new InMemoryIDBStore('computedAttributes');

        await mainStore.set(key, { model: 'User', url: 'https://alice.example.org#me', name: 'Alice' });
        await expect(workerStore.get(key)).resolves.toBeDefined();

        // Act
        await mainStore.traverse('readwrite', (cursor) => cursor.delete());

        // Assert
        await vi.waitFor(() => expect(workerStore.get(key)).resolves.toBeUndefined());
    });
});
