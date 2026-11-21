import { FakeServer } from '@noeldemartin/testing';
import MigrateLocalUrlsJob from 'soukai-bis/jobs/migrate-local-urls/MigrateLocalUrlsJob';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import Post from 'soukai-bis/testing/stubs/Post';
import { describe, expect, it, vi } from 'vite-plus/test';

import { connect, postContainerUrls, properties, session, typeIndexes, user } from './testing/helpers';

describe('SyncSession setup', () => {
    it('completes setup when connecting without local models', async () => {
        // Act
        await connect();

        // Assert
        expect(properties.setupCompleted).toBe(true);
    });

    it('requires setup when connecting with local models', async () => {
        // Arrange
        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });

        // Act
        await connect({ models: [{ model: Post, registration: true }] });

        // Assert
        expect(properties.setupCompleted).toBe(false);
    });

    it('migrates local models to registered containers', async () => {
        // Arrange
        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
        });

        const start = vi.spyOn(session, 'start');

        // Act
        await session.setup();

        // Assert
        const posts = await Post.all();

        expect(properties.setupCompleted).toBe(true);
        expect(start).not.toHaveBeenCalled();
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(session.requireRemoteContainerUrl(Post)).toEqual('https://alice.example/blog/');
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

        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({
            findTypeIndexes: typeIndexes([[Post, 'https://alice.example/blog/']]),
            models: [{ model: Post, registration: true }],
        });
        await session.setup();

        // Act
        await session.setup();

        // Assert
        expect(run).toHaveBeenCalledOnce();
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
    });

    it('waits for running setups when disconnecting', async () => {
        // Arrange
        let disconnected!: Promise<void>;

        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({
            findTypeIndexes: async () => {
                disconnected = session.disconnect();

                return { publicTypeIndexes: [], privateTypeIndexes: [] };
            },
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.setup();
        await disconnected;

        // Assert
        const posts = await Post.all();

        expect(session.connected).toBe(false);
        expect(session.setupCompleted).toBe(false);
        expect(properties.setupCompleted).toBe(false);
        expect(posts[0]?.url.startsWith('local://')).toBe(true);
    });

    it('does not complete setups when disconnecting during migrations', async () => {
        // Arrange
        let disconnected!: Promise<void>;

        vi.spyOn(MigrateLocalUrlsJob.prototype as unknown as { run(): Promise<void> }, 'run').mockImplementation(
            async () => void (disconnected = session.disconnect()),
        );

        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({ findTypeIndexes: typeIndexes(), models: [{ model: Post, registration: true }] });

        // Act
        await session.setup();
        await disconnected;

        // Assert
        expect(session.connected).toBe(false);
        expect(properties.setupCompleted).toBe(false);
    });

    it('finds type indexes from the user profile by default', async () => {
        // Arrange
        const privateTypeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        FakeServer.respondOnce(
            privateTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <${Post.getRDFClasses()[0]}> ;
                    solid:instanceContainer <https://alice.example/blog/> .
            `,
        );

        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({
            profileManager: { getProfile: () => ({ ...user, privateTypeIndexUrls: [privateTypeIndexUrl] }) },
            models: [{ model: Post, registration: true }],
        });

        // Act
        await session.setup();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/blog/');
        expect(properties.containerUrls?.Post?.registered).toEqual(['https://alice.example/blog/']);
    });

    it('migrates local models to the registration path when they are not registered', async () => {
        // Arrange
        trackLocalChanges(Post);
        await Post.create({ title: 'Offline' });
        await connect({
            findTypeIndexes: typeIndexes(),
            models: [{ model: Post, registration: { path: '/articles/' } }],
        });

        // Act
        await session.setup();

        // Assert
        expect(Post.defaultContainerUrl).toEqual('https://alice.example/articles/');
        expect(properties.containerUrls).toEqual({
            Post: postContainerUrls({ default: 'https://alice.example/articles/' }),
        });
    });
});
