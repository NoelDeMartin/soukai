import { FakeResponse, FakeServer, fakeContainerUrl } from '@noeldemartin/testing';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine, setRemoteEngine } from 'soukai-bis/engines/state';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { readFile, readFileIfExists } from './files';

describe('Files', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('reads files from local engines', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        await engine.writeFile(url, new Blob(['page'], { type: 'image/png' }));

        // Act
        const blob = await readFile(url);

        // Assert
        expect(await blob.text()).toEqual('page');
        expect(FakeServer.getRequests()).toHaveLength(0);
    });

    it('reads files without local contents from the remote engine', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        await engine.updateFile(url, { mimeType: 'image/png', availableOffline: false });

        FakeServer.respondOnce(url, new Response('page'));

        // Act
        const blob = await readFile(url);

        // Assert
        expect(await blob.text()).toEqual('page');
        expect(FakeServer.getRequests()).toHaveLength(1);
    });

    it('reads unknown files from the remote engine', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        FakeServer.respondOnce(url, new Response('page'));

        // Act
        const blob = await readFile(url);

        // Assert
        expect(await blob.text()).toEqual('page');
    });

    it('does not read deleted files', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        await engine.writeFile(url, new Blob(['page']));
        await engine.deleteFile(url, { localChanges: () => ({ resources: { [url]: { deletedAt: new Date() } } }) });

        // Act & Assert
        expect(await readFileIfExists(url)).toBeNull();
        await expect(readFile(url)).rejects.toThrow(DocumentNotFound);
        expect(FakeServer.getRequests()).toHaveLength(0);
    });

    it('does not read local urls from the remote engine', async () => {
        // Act & Assert
        expect(await readFileIfExists('local://pages/001.png')).toBeNull();
        expect(FakeServer.getRequests()).toHaveLength(0);
    });

    it('does not read from the remote engine if there is none', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        setRemoteEngine(null);

        // Act & Assert
        expect(await readFileIfExists(url)).toBeNull();
    });

    it('returns null for missing remote files', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        FakeServer.respondOnce(url, FakeResponse.notFound());

        // Act & Assert
        expect(await readFileIfExists(url)).toBeNull();
    });
});
