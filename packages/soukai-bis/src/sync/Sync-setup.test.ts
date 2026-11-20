import MigrateLocalUrlsJob from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import Post from 'soukai-bis/testing/stubs/Post';
import { describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import { connect, postContainerUrls, properties, typeIndexes } from './testing/helpers';

describe('Sync setup', () => {
    it('completes setup when connecting without local models', async () => {
        // Act
        await connect();

        // Assert
        expect(properties.setupCompleted).toBe(true);
    });

    it('requires setup when connecting with local models', async () => {
        // Arrange
        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });

        // Act
        await connect();

        // Assert
        expect(properties.setupCompleted).toBe(false);
    });

    it('migrates local models to registered containers', async () => {
        // Arrange
        const start = vi.spyOn(Sync.requireInstance(), 'start');

        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });
        await connect({ findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]) });

        // Act
        await Sync.setup();

        // Assert
        const posts = await Post.all();

        expect(properties.setupCompleted).toBe(true);
        expect(start).not.toHaveBeenCalled();
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(Sync.requireRemoteContainerUrl(Post)).toEqual('https://alice.example/blog/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({
                default: 'https://alice.example/blog/',
                registered: ['https://alice.example/blog/'],
            }),
        });
        expect(posts.map((post) => post.title)).toEqual(['Offline']);
        expect(posts[0]?.url.startsWith('https://alice.example/blog/')).toBe(true);
    });

    it('only migrates local urls', async () => {
        // Arrange
        const run = vi.spyOn(MigrateLocalUrlsJob.prototype as unknown as { run(): Promise<void> }, 'run');

        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });
        await connect({ findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]) });
        await Sync.setup();

        // Act
        await Sync.setup();

        // Assert
        expect(run).toHaveBeenCalledOnce();
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('waits for running setups when disconnecting', async () => {
        // Arrange
        let disconnected!: Promise<void>;

        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });
        await connect({
            findTypeIndexes: async () => {
                disconnected = Sync.disconnect();

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
        });

        // Act
        await Sync.setup();
        await disconnected;

        // Assert
        const posts = await Post.all();

        expect(Sync.connected).toBe(false);
        expect(Sync.setupCompleted).toBe(false);
        expect(properties.setupCompleted).toBe(false);
        expect(posts[0]?.url.startsWith('local://')).toBe(true);
    });

    it('does not complete setups when disconnecting during migrations', async () => {
        // Arrange
        let disconnected!: Promise<void>;

        vi.spyOn(MigrateLocalUrlsJob.prototype as unknown as { run(): Promise<void> }, 'run').mockImplementation(
            async () => void (disconnected = Sync.disconnect()),
        );

        await Sync.trackModels([{ model: Post, registration: true }]);
        await Post.create({ title: 'Offline' });
        await connect({ findTypeIndexes: typeIndexes() });

        // Act
        await Sync.setup();
        await disconnected;

        // Assert
        expect(Sync.connected).toBe(false);
        expect(properties.setupCompleted).toBe(false);
    });

    it('migrates local models to the registration path when they are not registered', async () => {
        // Arrange
        await Sync.trackModels([{ model: Post, registration: { path: '/articles/' } }]);
        await Post.create({ title: 'Offline' });
        await connect({ findTypeIndexes: typeIndexes() });

        // Act
        await Sync.setup();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/articles/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({ default: 'https://alice.example/articles/' }),
        });
    });
});
