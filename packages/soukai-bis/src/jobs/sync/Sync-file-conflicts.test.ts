import { expandIRI } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import User from 'soukai-bis/testing/stubs/User';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import { setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync file conflicts', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    const syncedAt = new Date('2026-11-17T07:00:00Z');
    const remoteModifiedAt = new Date('2026-11-17T08:00:00Z');

    let containerUrl: string;
    let documentUrl: string;
    let imageUrl: string;

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());

        containerUrl = fakeContainerUrl({ baseUrl: config.userProfile.storageUrls[0] });
        documentUrl = fakeDocumentUrl({ containerUrl });
        imageUrl = `${containerUrl}image.png`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];
    });

    it('keeps remote files modified remotely', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

        respondContainer({ [imageUrl]: remoteModifiedAt });

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.writeFile(imageUrl, new Blob(['local']), {
            localChanges: fileLocalChanges(imageUrl, 'updated'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(resolveFileConflict).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'modified-remotely',
                url: imageUrl,
                remoteUpdatedAt: remoteModifiedAt,
            }),
        );
        expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        expect(file).toMatchObject({ mimeType: 'image/png', lastModifiedAt: remoteModifiedAt });
        expect(file?.blob).toBeUndefined();
    });

    it('keeps local files modified remotely', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-local' as const);

        respondContainer({ [imageUrl]: remoteModifiedAt });
        FakeServer.respondOnce(imageUrl, FakeResponse.success());

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.writeFile(imageUrl, new Blob(['local']), {
            localChanges: fileLocalChanges(imageUrl, 'updated'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
        expect(FakeServer.getRequest('PUT', imageUrl)?.headers).not.toHaveProperty('If-Unmodified-Since');
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('detects files created remotely with the same url', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

        respondContainer({ [imageUrl]: remoteModifiedAt });

        await localEngine.writeFile(imageUrl, new Blob(['local'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
        expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ lastModifiedAt: remoteModifiedAt });
    });

    it('detects files deleted remotely', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

        respondContainer({});

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.writeFile(imageUrl, new Blob(['local']), {
            localChanges: fileLocalChanges(imageUrl, 'updated'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        expect(resolveFileConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-remotely', url: imageUrl }),
        );
        expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
        expect(await localEngine.getFile(imageUrl)).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('detects files deleted locally and modified remotely', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

        respondContainer({ [imageUrl]: remoteModifiedAt });

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(resolveFileConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-locally', url: imageUrl }),
        );
        expect(FakeServer.getRequest('DELETE', imageUrl)).toBeNull();
        expect(file?.deleted).toBeFalsy();
        expect(file).toMatchObject({ lastModifiedAt: remoteModifiedAt });
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('detects conflicts using conditional requests', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-local' as const);

        respondContainer({ [imageUrl]: syncedAt });
        FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 412));
        FakeServer.respondOnce(imageUrl, FakeResponse.success());

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.writeFile(imageUrl, new Blob(['local']), {
            localChanges: fileLocalChanges(imageUrl, 'updated'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            resolveFileConflict,
        });

        // Assert
        const [conditionalRequest, overwriteRequest] = FakeServer.getRequests(imageUrl);

        expect(conditionalRequest?.headers).toHaveProperty('If-Unmodified-Since', 'Tue, 17 Nov 2026 07:00:01 GMT');
        expect(resolveFileConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'modified-remotely', url: imageUrl, remoteUpdatedAt: null }),
        );
        expect(overwriteRequest?.headers).not.toHaveProperty('If-Unmodified-Since');
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('downloads offline files kept remotely after conditional requests', async () => {
        // Arrange
        const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

        respondContainer({ [imageUrl]: syncedAt });
        FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 412));
        FakeServer.respondOnce(
            imageUrl,
            new Response(null, { headers: { 'Last-Modified': remoteModifiedAt.toUTCString() } }),
        );
        FakeServer.respondOnce(imageUrl, new Response('remote', { headers: { 'Content-Type': 'image/png' } }));

        await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
        await localEngine.writeFile(imageUrl, new Blob(['local']), {
            localChanges: fileLocalChanges(imageUrl, 'updated'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
            ],
            resolveFileConflict,
        });

        // Assert
        expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('remote');
        expect(await localEngine.getFile(imageUrl)).toMatchObject({
            mimeType: 'image/png',
            lastModifiedAt: remoteModifiedAt,
        });
    });

    function respondContainer(files: Record<string, Date>): void {
        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle({
                    [documentUrl]: { lastModifiedAt: new Date() },
                    ...Object.fromEntries(Object.entries(files).map(([url, date]) => [url, { lastModifiedAt: date }])),
                })}
                ${Object.keys(files)
                    .map((url) => `<${url}> a <http://www.w3.org/ns/iana/media-types/image/png#Resource> .`)
                    .join('\n')}
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));
    }
});
