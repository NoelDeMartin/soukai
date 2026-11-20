import { fakeContainerUrl } from '@noeldemartin/testing';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import { defineLocalEngineFileTests } from 'soukai-bis/testing/utils/local-engines';
import { describe, expect, it } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';

describe('IndexedDBEngine files', () => {
    defineLocalEngineFileTests(() => new IndexedDBEngine());

    it('stores file contents separately as ArrayBuffer', async () => {
        // Arrange
        const engine = new IndexedDBEngine();
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        // Act
        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Assert
        const connection = await SoukaiIndexedDB.connect();
        const metadata = await connection.get('files', fileUrl);
        const content = await connection.get('fileContents', fileUrl);

        expect(metadata).toEqual({ url: fileUrl, containerUrl, mimeType: 'image/png', hasLocalContents: true });
        expect(content?.data).toBeInstanceOf(ArrayBuffer);
        expect(new TextDecoder().decode(content?.data)).toEqual('page');
    });

    it('removes file contents when evicting a blob', async () => {
        // Arrange
        const engine = new IndexedDBEngine();
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Act
        await engine.updateFile(fileUrl, { blob: null });

        // Assert
        const connection = await SoukaiIndexedDB.connect();

        expect(await connection.get('files', fileUrl)).toEqual({ url: fileUrl, containerUrl, mimeType: 'image/png' });
        expect(await connection.get('fileContents', fileUrl)).toBeUndefined();
    });

    it('preserves file contents when updating metadata only', async () => {
        // Arrange
        const engine = new IndexedDBEngine();
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Act
        await engine.updateFile(fileUrl, { availableOffline: true });

        // Assert
        const connection = await SoukaiIndexedDB.connect();
        const content = await connection.get('fileContents', fileUrl);

        expect(await connection.get('files', fileUrl)).toEqual({
            url: fileUrl,
            containerUrl,
            mimeType: 'image/png',
            availableOffline: true,
            hasLocalContents: true,
        });
        expect(new TextDecoder().decode(content?.data)).toEqual('page');
    });

    it('cleans up file contents when dropping containers', async () => {
        // Arrange
        const engine = new IndexedDBEngine();
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Act
        await engine.dropContainers([containerUrl]);

        // Assert
        const connection = await SoukaiIndexedDB.connect();

        expect(await connection.get('files', fileUrl)).toBeUndefined();
        expect(await connection.get('fileContents', fileUrl)).toBeUndefined();
    });
});
