import { after } from '@noeldemartin/utils';
import { requireEngine } from 'soukai-bis/engines/state';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import Post from 'soukai-bis/testing/stubs/Post';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import SyncSession from './SyncSession';
import FakeSyncStorageProvider from './testing/FakeSyncStorageProvider';
import { connect, fakeSyncJob, postContainerUrls, properties, session, storage } from './testing/helpers';

describe('SyncSession external sources', () => {
    const source: ExternalSource = { containerUrl: 'https://bob.example/posts/', models: [Post] };

    it('passes external sources to sync jobs', async () => {
        // Arrange
        let config: SyncJobConfig | null = null;

        fakeSyncJob({ onRun: (job) => (config = (job as unknown as { config: SyncJobConfig }).config) });

        await connect({ models: [{ model: Post, registration: true }] });

        await Sync.addExternalSource(source);

        // Act
        await session.synchronize();

        // Assert
        expect(config).toMatchObject({ externalSources: [source] });
    });

    it('adds external sources once', async () => {
        // Arrange
        await connect();

        // Act
        await Sync.addExternalSource(source);
        await Sync.addExternalSource({ ...source });

        // Assert
        expect(Sync.externalSources).toEqual([source]);
        expect(Sync.hasExternalSource(source)).toBe(true);
    });

    it('restores external sources when connecting', async () => {
        // Act
        await connect({ externalSources: [source] });

        // Assert
        expect(Sync.externalSources).toEqual([source]);
    });

    it('saves external sources', async () => {
        // Arrange
        const otherSource: ExternalSource = { containerUrl: 'https://carol.example/posts/', models: [Post] };

        await connect();

        // Act
        await Sync.addExternalSource(source);
        await Sync.addExternalSource(otherSource);

        await Sync.removeExternalSource(source);

        // Assert
        expect(storage.externalSources).toEqual([otherSource]);
    });

    it('manages external sources without sessions', async () => {
        // Arrange
        const storageProvider = new FakeSyncStorageProvider();
        const otherSource: ExternalSource = { containerUrl: 'https://carol.example/posts/', models: [Post] };

        await Sync.boot({ storageProvider });
        await Sync.addExternalSource(source);
        await Sync.addExternalSource(otherSource);

        const externalPost = await new Post({ title: 'Managed' }).save({ containerUrl: source.containerUrl });

        // Act
        await Sync.removeExternalSource(source);

        // Assert
        await expect(requireEngine().readDocumentIfExists(externalPost.requireDocumentUrl())).resolves.toBeNull();
        expect(Sync.externalSources).toEqual([otherSource]);
        expect(storageProvider.externalSources).toEqual([otherSource]);
    });

    it('fails adding external sources before booting', async () => {
        // Act & Assert
        await expect(Sync.addExternalSource(source)).rejects.toThrow(/hasn't been booted/);
        expect(Sync.externalSources).toEqual([]);
    });

    it('fails adding external sources with models that are not booted', async () => {
        // Arrange
        const UnbootedPost = class extends Post {};

        await connect();

        // Act & Assert
        await expect(Sync.addExternalSource({ ...source, models: [UnbootedPost] })).rejects.toThrow(
            /class isn't booted/,
        );
        expect(Sync.externalSources).toEqual([]);
    });

    it('fails connecting with external sources with models that are not booted', async () => {
        // Arrange
        const UnbootedPost = class extends Post {};

        // Act & Assert
        await expect(connect({ externalSources: [{ ...source, models: [UnbootedPost] }] })).rejects.toThrow(
            /class isn't booted/,
        );
        expect(Sync.session).toBeNull();
        await expect(connect()).resolves.toBeInstanceOf(SyncSession);
    });

    it('forwards external source errors', async () => {
        // Arrange
        const error = new Error('Forbidden');
        const onExternalSourceFailed = vi.fn();

        fakeSyncJob({ failedExternalSources: [[source, error]] });

        await connect({ onExternalSourceFailed });

        await Sync.addExternalSource(source);

        // Act
        await session.synchronize();

        // Assert
        expect(onExternalSourceFailed).toHaveBeenCalledWith(source, error);
    });

    it('does not track containers of models created in external sources', async () => {
        // Arrange
        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });

        await Sync.addExternalSource(source);

        // Act
        await new Post({ title: 'Managed' }).save({ containerUrl: source.containerUrl });

        // Assert
        await session.refreshLocalChanges();

        expect(properties.containerUrls?.Post?.unlisted).toEqual([]);
        expect(properties.localChangesCount).toBe(1);
    });

    it('removes external sources discarding unsynced changes', async () => {
        // Arrange
        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });

        await Sync.addExternalSource(source);

        const ownPost = await Post.create({ title: 'Mine' });
        const externalPost = await new Post({ title: 'Managed' }).save({ containerUrl: source.containerUrl });

        // Act
        await Sync.removeExternalSource(source);

        // Assert
        await expect(requireEngine().readDocumentIfExists(externalPost.requireDocumentUrl())).resolves.toBeNull();
        await expect(requireEngine().readDocumentIfExists(ownPost.requireDocumentUrl())).resolves.not.toBeNull();
        expect(properties.localChangesCount).toBe(1);
        expect(Sync.externalSources).toEqual([]);
    });

    it('removes instance external sources', async () => {
        // Arrange
        await connect();

        const externalPost = await new Post({ title: 'Managed' }).save({ containerUrl: source.containerUrl });
        const otherPost = await new Post({ title: 'Other' }).save({ containerUrl: source.containerUrl });
        const instanceSource: ExternalSource = { instanceUrl: externalPost.requireUrl(), models: [Post] };

        await Sync.addExternalSource(instanceSource);

        // Act
        await Sync.removeExternalSource(instanceSource);

        // Assert
        await expect(requireEngine().readDocumentIfExists(externalPost.requireDocumentUrl())).resolves.toBeNull();
        await expect(requireEngine().readDocumentIfExists(otherPost.requireDocumentUrl())).resolves.not.toBeNull();
        expect(Sync.externalSources).toEqual([]);
    });

    it('removes external sources without local documents', async () => {
        // Arrange
        const otherSource: ExternalSource = { containerUrl: 'https://carol.example/posts/', models: [Post] };

        await connect();

        await Sync.addExternalSource(source);
        await Sync.addExternalSource(otherSource);

        // Act
        await Sync.removeExternalSource(otherSource);

        // Assert
        expect(Sync.externalSources).toEqual([source]);
    });

    it('removes external sources after running syncs', async () => {
        // Arrange
        let pulledPost: Post | null = null;
        let resumeSync!: () => void;
        const syncPaused = new Promise<void>((resolve) => (resumeSync = resolve));

        fakeSyncJob({
            onRun: async () => {
                await syncPaused;

                pulledPost ??= await new Post({ title: 'Pulled' }).save({ containerUrl: source.containerUrl });
            },
        });

        await connect({ models: [{ model: Post, registration: true }] });

        await Sync.addExternalSource(source);

        // Act
        const syncing = session.synchronize();
        const removing = Sync.removeExternalSource(source);

        await after({ milliseconds: 10 });

        resumeSync();

        await Promise.all([syncing, removing]);

        // Assert
        expect(pulledPost).not.toBeNull();
        await expect(
            requireEngine().readDocumentIfExists((pulledPost as unknown as Post).requireDocumentUrl()),
        ).resolves.toBeNull();
        expect(properties.localChangesCount).toBe(0);
        expect(Sync.externalSources).toEqual([]);
    });
});
