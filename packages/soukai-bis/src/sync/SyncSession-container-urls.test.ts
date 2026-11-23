import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import Post from 'soukai-bis/testing/stubs/Post';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import {
    connect,
    fakeSyncJob,
    typeIndexWithRegistrations,
    postContainerUrls,
    properties,
    session,
    storage,
    typeIndexes,
} from './testing/helpers';

describe('SyncSession container urls', () => {
    it('restores default containers when connecting', async () => {
        // Arrange
        const containerUrls = { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) };

        // Act
        await connect({ containerUrls, models: [{ model: Post, registration: true }] });

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('restores container urls from async storage', async () => {
        // Arrange
        const containerUrls = { Post: postContainerUrls({ default: 'https://alice.example/blog/' }) };

        // Act
        await connect({
            models: [{ model: Post, registration: true }],
            storageProvider: {
                getSetupCompleted: async () => true,
                setSetupCompleted: () => null,
                getContainerUrls: async () => containerUrls,
                setContainerUrls: () => null,
                getExternalSources: async () => [],
                setExternalSources: () => null,
            },
        });

        // Assert
        expect(Sync.containerUrls).toEqual(containerUrls);
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('saves container urls updated during sync', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(storage.containerUrls).toEqual({
            Post: postContainerUrls({
                default: 'https://alice.example/blog/',
                registered: ['https://alice.example/blog/'],
            }),
        });
    });

    it('notifies container changes', async () => {
        // Arrange
        const onContainersUpdated = vi.fn();

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
            onContainersUpdated,
        });

        // Act
        await session.synchronize();
        await session.synchronize();

        // Assert
        expect(onContainersUpdated).toHaveBeenCalledOnce();
        expect(onContainersUpdated).toHaveBeenCalledWith(Post, ['https://alice.example/blog/']);
    });

    it('reads models from containers registered during sync', async () => {
        // Arrange
        const findTypeIndexes = vi.fn(typeIndexes([[Post, 'https://alice.example/blog/']]));

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes,
            models: [{ model: Post, registration: true }],
        });

        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/']);

        // Act
        await session.synchronize();

        // Assert
        expect(findTypeIndexes).toHaveBeenCalledOnce();
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({
                default: 'https://alice.example/blog/',
                registered: ['https://alice.example/blog/'],
            }),
        });
        expect(Sync.getDiscoveryUrls(Post)).toContain('https://alice.example/blog/');
    });

    it('reads models from type indexes created during sync', async () => {
        // Arrange
        fakeSyncJob({ createdTypeIndex: typeIndexWithRegistrations([[Post, 'https://alice.example/blog/']]) });

        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });

        // Act
        await session.synchronize();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(properties.containerUrls?.Post?.registered).toEqual(['https://alice.example/blog/']);
    });

    it('keeps the default container when registration fails', async () => {
        // Arrange
        fakeSyncJob({ failedRegistrations: [Post] });

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/posts/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({ registered: ['https://alice.example/blog/'] }),
        });
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', 'https://alice.example/blog/']);
    });

    it('reads models from all registered containers', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: typeIndexes([
                [Post, 'https://alice.example/blog/'],
                [Post, 'https://alice.example/posts/'],
            ]),
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/posts/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({ registered: ['https://alice.example/blog/', 'https://alice.example/posts/'] }),
        });
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', 'https://alice.example/blog/']);
    });

    it('reads singleton models from registered instances', async () => {
        // Arrange
        const registeredPostUrl = 'https://alice.example/blog/registered#it';
        const typeIndex = typeIndexWithRegistrations();

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ forClass: Post.getRDFClasses(), instance: registeredPostUrl }),
        ];

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: async () => ({ publicTypeIndexes: [], privateTypeIndexes: [typeIndex] }),
            models: [{ model: Post, registration: { mode: 'instance' } }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/posts/');
        expect(properties.containerUrls).toEqual({ Post: postContainerUrls({ instances: [registeredPostUrl] }) });
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', registeredPostUrl]);
    });

    it('reads singleton models from the default container before they are registered', async () => {
        // Act
        await connect({
            containerUrls: { Post: postContainerUrls() },
            models: [{ model: Post, registration: { mode: 'instance' } }],
        });

        // Assert
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/']);
        expect(properties.containerUrls).toEqual({ Post: postContainerUrls() });
    });

    it('reads singleton models from registered containers', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls() },
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: { mode: 'instance' } }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(properties.containerUrls?.Post?.registered).toEqual(['https://alice.example/blog/']);
        expect(properties.containerUrls?.Post?.instances).toEqual([]);
        expect(Sync.getDiscoveryUrls(Post)).toContain('https://alice.example/blog/');
    });

    it('reads models from registered instances', async () => {
        // Arrange
        const registeredPostUrl = 'https://alice.example/blog/registered#it';
        const typeIndex = typeIndexWithRegistrations();

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ forClass: Post.getRDFClasses(), instance: registeredPostUrl }),
        ];

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls({ unlisted: ['https://alice.example/drafts/'] }) },
            findTypeIndexes: async () => ({ publicTypeIndexes: [], privateTypeIndexes: [typeIndex] }),
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(properties.containerUrls?.Post?.instances).toEqual([registeredPostUrl]);
        expect(Sync.getDiscoveryUrls(Post)).toEqual([
            'https://alice.example/posts/',
            registeredPostUrl,
            'https://alice.example/drafts/',
        ]);
    });

    it('reads singleton models that have not been registered yet', async () => {
        // Arrange
        const registeredPostUrl = 'https://alice.example/blog/registered#it';
        const typeIndex = typeIndexWithRegistrations();

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ forClass: Post.getRDFClasses(), instance: registeredPostUrl }),
        ];

        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls({ instances: [registeredPostUrl] }) },
            findTypeIndexes: async () => ({ publicTypeIndexes: [], privateTypeIndexes: [typeIndex] }),
            models: [{ model: Post, registration: { mode: 'instance' } }],
        });
        await new Post({ title: 'Post' }).save({ containerUrl: 'https://alice.example/posts/' });

        // Act
        await session.synchronize();

        // Assert
        expect(properties.containerUrls?.Post?.instances).toEqual([registeredPostUrl]);
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', registeredPostUrl]);
    });

    it('reads models from registered containers before syncing', async () => {
        // Act
        await connect({
            containerUrls: { Post: postContainerUrls({ registered: ['https://alice.example/blog/'] }) },
            models: [{ model: Post, registration: true }],
        });

        // Assert
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', 'https://alice.example/blog/']);
    });

    it('reads models created in unlisted containers', async () => {
        // Arrange
        fakeSyncJob();

        await connect({ containerUrls: { Post: postContainerUrls() }, models: [{ model: Post, registration: true }] });
        await new Post({ title: 'Elsewhere' }).save({ containerUrl: 'https://alice.example/blog/' });

        // Act
        await session.synchronize();

        // Assert
        expect(properties.containerUrls?.Post?.unlisted).toEqual(['https://alice.example/blog/']);
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', 'https://alice.example/blog/']);
    });

    it('ignores containers of models created in registered instances', async () => {
        // Arrange
        const post = new Post({ title: 'Registered' });
        const instanceUrl = post.mintUrl({ containerUrl: 'https://alice.example/blog/' });

        await connect({
            containerUrls: { Post: postContainerUrls({ instances: [instanceUrl] }) },
            models: [{ model: Post, registration: { mode: 'instance' } }],
        });

        // Act
        await post.save();

        // Assert
        expect(properties.containerUrls?.Post?.unlisted).toEqual([]);
    });

    it('reads models from unlisted containers before syncing', async () => {
        // Act
        await connect({
            containerUrls: { Post: postContainerUrls({ unlisted: ['https://alice.example/blog/'] }) },
            models: [{ model: Post, registration: true }],
        });

        // Assert
        expect(Sync.getDiscoveryUrls(Post)).toEqual(['https://alice.example/posts/', 'https://alice.example/blog/']);
    });

    it('forgets unlisted containers once they are registered', async () => {
        // Arrange
        fakeSyncJob();

        await connect({
            containerUrls: { Post: postContainerUrls({ unlisted: ['https://alice.example/blog/'] }) },
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.synchronize();

        // Assert
        expect(properties.containerUrls?.Post?.registered).toEqual(['https://alice.example/blog/']);
        expect(properties.containerUrls?.Post?.unlisted).toEqual([]);
    });
});
