import { SolidDocument } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { escapeRegexText, fail, objectDeepClone, required, urlRoute } from '@noeldemartin/utils';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import { getSchema } from 'soukai-bis/models/internals/model';
import Playlist from 'soukai-bis/testing/stubs/Playlist';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it, vi } from 'vite-plus/test';
import z from 'zod';

import { bootModels } from './registry';
import { belongsToMany } from './relations/fluent';
import { defineSchema } from './schema';

describe('Model urls', () => {
    it('saves instances in containers', async () => {
        // Arrange
        const containerUrl = 'local://inbox/';

        // Act
        const user = await new User({ name: 'John Doe' }).save({ containerUrl, postToContainer: true });

        // Assert
        expect(user.requireContainerUrl()).toEqual(containerUrl);
        expect(user.exists()).toBe(true);
        expect(engine.documents[user.requireDocumentUrl()]).toBeDefined();
    });

    it('saves instances in containers with unique urls', async () => {
        // Arrange
        const containerUrl = 'local://inbox/';
        const url = `${containerUrl}john#it`;

        await new User({ url, name: 'John Doe' }).save({ containerUrl, postToContainer: true });

        // Act
        const user = await new User({ url, name: 'Jane Doe' }).save({ containerUrl, postToContainer: true });

        // Assert
        const freshUser = await User.find(user.url);

        expect(user.url).not.toEqual(url);
        expect(user.requireDocumentUrl()).toMatch(new RegExp(`^${escapeRegexText(`${containerUrl}john-`)}`));
        expect(user.metadata?.url).toEqual(`${user.requireDocumentUrl()}#it-metadata`);
        expect(user.metadata?.resourceUrl).toEqual(user.url);
        expect(freshUser?.name).toEqual('Jane Doe');
        expect(freshUser?.metadata?.url).toEqual(user.metadata?.url);
        expect((await User.find(url))?.name).toEqual('John Doe');
    });

    it('mints provisional urls ignoring slugs when url minting is disabled', () => {
        // Arrange
        class DocumentSlugStub extends defineSchema({
            mintsUrls: false,
            fields: {
                name: z.string().useAsSlug(),
            },
        }) {}

        class ContainerSlugStub extends defineSchema({
            mintsUrls: false,
            fields: {
                name: z.string().useAsContainerSlug(),
            },
        }) {}

        bootModels({ DocumentSlugStub, ContainerSlugStub });

        const documentSlugStub = new DocumentSlugStub({ name: 'Alice' });
        const containerSlugStub = new ContainerSlugStub({ name: 'Alice' });

        // Act
        documentSlugStub.mintUrl({ containerUrl: 'local://stubs/' });
        containerSlugStub.mintUrl({ containerUrl: 'local://stubs/' });

        // Assert
        const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

        expect(documentSlugStub.url).toMatch(new RegExp(`^local://stubs/${uuidPattern}#it$`));
        expect(containerSlugStub.url).toMatch(new RegExp(`^local://stubs/${uuidPattern}#it$`));
    });

    it('inherits url minting configuration', () => {
        // Arrange
        const A = defineSchema({ mintsUrls: false });
        const B = defineSchema(A, {});
        const C = defineSchema(A, { mintsUrls: true });

        // Act
        bootModels({ A, B, C });

        // Assert
        expect(getSchema(A).mintsUrls).toBe(false);
        expect(getSchema(B).mintsUrls).toBe(false);
        expect(getSchema(C).mintsUrls).toBe(true);
    });

    it('keeps url minting configuration when updating schemas', async () => {
        // Arrange
        class Stub extends defineSchema({ mintsUrls: false }) {}

        const OtherSchema = defineSchema({ rdfContext: 'https://schema.org/' });

        bootModels({ Stub, OtherSchema });

        // Act
        await Stub.updateSchema(OtherSchema);

        // Assert
        expect(getSchema(OtherSchema).mintsUrls).toBe(true);
        expect(getSchema(Stub).mintsUrls).toBe(false);
    });

    it('fails creating models with explicit urls when resources already exist', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const existingDocument = {
            graph: {
                '@graph': [
                    {
                        '@id': documentUrl,
                        '@type': 'http://www.w3.org/ns/ldp#Document',
                    },
                    {
                        '@id': `${documentUrl}#it`,
                        '@type': 'http://xmlns.com/foaf/0.1/Person',
                        'http://xmlns.com/foaf/0.1/name': 'John Doe',
                    },
                ],
            },
        };

        engine.documents[documentUrl] = objectDeepClone(existingDocument);

        // Act
        const createUser = User.create({ url: `${documentUrl}#it`, name: 'Jane Doe' });

        // Assert
        await expect(createUser).rejects.toBeInstanceOf(DocumentAlreadyExists);

        expect(engine.documents[documentUrl]).toEqual(existingDocument);
    });

    it('mints urls without slugs', () => {
        // Arrange
        const Note = defineSchema({
            fields: {
                title: z.string().optional().useAsSlug(),
            },
        });

        bootModels({ Note });

        // Act
        const url = new Note().mintUrl();

        // Assert
        expect(url).not.toContain('undefined');
    });

    it('creates unique documents when minted urls already exist', async () => {
        // Arrange
        const documentUrl = `${Show.defaultContainerUrl}the-office`;
        const existingDocument = {
            graph: {
                '@id': documentUrl,
                '@type': 'http://www.w3.org/ns/ldp#Document',
            },
        };

        engine.documents[documentUrl] = objectDeepClone(existingDocument);

        // Act
        const show = await Show.create({ name: 'The Office' });

        // Assert
        expect(show.url).toMatch(new RegExp(`^${escapeRegexText(documentUrl)}-[\\w-]+#it$`));
        expect(show.getSlug()).toEqual(urlRoute(show.url).split('/').pop());
        expect(show.metadata?.url?.startsWith(show.requireDocumentUrl())).toBe(true);
        expect(show.metadata?.resourceUrl).toEqual(show.url);
        expect(engine.documents[documentUrl]).toEqual(existingDocument);
        expect(engine.documents[show.requireDocumentUrl()]).toBeDefined();
    });

    it('creates unique documents with same-document relations when minted urls already exist', async () => {
        // Arrange
        const documentUrl = `${Show.defaultContainerUrl}the-office`;
        const show = new Show({ name: 'The Office' });

        engine.documents[documentUrl] = {
            graph: {
                '@id': documentUrl,
                '@type': 'http://www.w3.org/ns/ldp#Document',
            },
        };

        show.mintUrl();

        const season = show.relatedSeasons.attach({}, { mintUrl: true });

        // Act
        await show.save();

        // Assert
        const uniqueDocumentUrl = show.requireDocumentUrl();

        expect(uniqueDocumentUrl).not.toEqual(documentUrl);
        expect(season.requireDocumentUrl()).toEqual(uniqueDocumentUrl);
        expect(season.metadata?.requireDocumentUrl()).toEqual(uniqueDocumentUrl);
        expect(season.metadata?.resourceUrl).toEqual(season.url);
        expect(show.seasonUrls).toEqual([season.url]);
        expect(engine.documents[documentUrl]?.graph).toEqual({
            '@id': documentUrl,
            '@type': 'http://www.w3.org/ns/ldp#Document',
        });

        const freshShow = await Show.find(required(show.url));

        await freshShow?.loadRelation('seasons');

        expect(freshShow?.seasons?.map((freshSeason) => freshSeason.url)).toEqual([season.url]);
    });

    it('updates foreign keys in other documents when minted urls already exist', async () => {
        // Arrange
        const user = new User({ name: 'Jane Doe' });
        const post = user.relatedPosts.attach({ title: 'Hello World' });

        post.mintUrl();
        user.mintUrl();

        const mintedUrl = user.url;

        vi.spyOn(engine, 'createDocument').mockImplementationOnce(async (url) =>
            fail(DocumentAlreadyExists, url, new SolidDocument(url)),
        );

        // Act
        await user.save();

        // Assert
        expect(user.url).not.toEqual(mintedUrl);
        expect(post.authorUrl).toEqual(user.url);
    });

    it('updates foreign key arrays in other documents when minted urls already exist', async () => {
        // Arrange
        const user = await User.create({ name: 'Jane Doe' });
        const friend = user.relatedFriends.attach({ name: 'John Doe' }, { mintUrl: true });
        const mintedUrl = friend.url;

        friend.relatedFriends.attach(user);

        vi.spyOn(engine, 'createDocument').mockImplementationOnce(async (url) =>
            fail(DocumentAlreadyExists, url, new SolidDocument(url)),
        );

        // Act
        await friend.save();

        // Assert
        expect(friend.url).not.toEqual(mintedUrl);
        expect(user.friendUrls).toEqual([friend.url]);
    });

    it('creates models with minted urls in explicit documents that already exist', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const createDocumentSpy = vi.spyOn(engine, 'createDocument');
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const user = new User({ name: 'Jane Doe' });

        engine.documents[documentUrl] = {
            graph: {
                '@id': documentUrl,
                '@type': 'http://www.w3.org/ns/ldp#Document',
            },
        };

        user.mintUrl({ documentUrl, documentExists: false });

        // Act
        await user.save();

        // Assert
        expect(user.requireDocumentUrl()).toEqual(documentUrl);
        expect(createDocumentSpy).toHaveBeenCalledTimes(1);
        expect(updateDocumentSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps existing references when minted urls already exist', async () => {
        // Arrange
        const playlist = await Playlist.create({ name: 'Favorites' });
        const firstSong = playlist.relatedSongs.attach({ title: 'Yesterday' }, { mintUrl: true });

        await playlist.relatedSongs.save(firstSong);

        const secondSong = playlist.relatedSongs.attach({ title: 'Yesterday' }, { mintUrl: true });

        // Act
        await playlist.relatedSongs.save(secondSong);

        // Assert
        expect(secondSong.url).not.toEqual(firstSong.url);
        expect(playlist.songUrls).toEqual([firstSong.url, secondSong.url]);
    });

    it('keeps existing references without inverse relations when minted urls already exist', async () => {
        // Arrange
        const Album = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'MusicAlbum',
            fields: {
                name: z.string(),
                trackUrls: z.array(z.url()).rdfProperty('track').default([]),
            },
            relations: {
                tracks: belongsToMany('Track', 'trackUrls'),
            },
        });

        bootModels({ Album });

        const album = await Album.create({ name: 'Help!' });
        const firstTrack = album.relatedTracks.attach({ title: 'Yesterday' }, { mintUrl: true });

        await album.relatedTracks.save(firstTrack);

        const secondTrack = album.relatedTracks.attach({ title: 'Yesterday' }, { mintUrl: true });

        // Act
        await album.relatedTracks.save(secondTrack);

        // Assert
        expect(secondTrack.url).not.toEqual(firstTrack.url);
        expect(album.trackUrls).toEqual([firstTrack.url, secondTrack.url]);
    });

    it('fails creating unique documents when unique urls already exist', async () => {
        // Arrange
        const createDocumentSpy = vi
            .spyOn(engine, 'createDocument')
            .mockImplementation(async (url) => fail(DocumentAlreadyExists, url, new SolidDocument(url)));

        // Act
        const createShow = Show.create({ name: 'The Office' });

        // Assert
        await expect(createShow).rejects.toBeInstanceOf(DocumentAlreadyExists);

        expect(createDocumentSpy).toHaveBeenCalledTimes(2);
    });

    it('creates containers with minted urls that already exist', async () => {
        // Arrange
        const containerUrl = PostsCollection.urlFromSlug('drafts');

        await Post.createAt(containerUrl, { title: 'Hello World' });

        // Act
        const collection = await PostsCollection.create({ name: 'Drafts' });

        // Assert
        expect(collection.url).toEqual(containerUrl);
    });

    it('mints urls using the slug field', async () => {
        const post = await Post.create({ title: 'Hello World' });

        expect(post.url).toBe('local://posts/hello-world#it');
    });

    it('gets urls from slugs', async () => {
        // Act
        const post = await Post.create({ title: 'Hello World' });
        const collection = await PostsCollection.create({ name: 'Drafts' });

        // Assert
        expect(Post.urlFromSlug('hello-world')).toEqual(post.url);
        expect(Post.urlFromSlug('hello-world', { containerUrl: 'local://drafts/' })).toEqual(
            'local://drafts/hello-world#it',
        );
        expect(PostsCollection.urlFromSlug('drafts')).toEqual(collection.url);
    });

    it('mints container slug urls with default document slug', async () => {
        // Arrange
        const TVShow = defineSchema({
            fields: {
                name: z.string().useAsContainerSlug(),
            },
        });

        bootModels({ TVShow });

        // Act
        const tvShow = await TVShow.create({ name: 'The Office' });

        // Assert
        expect(tvShow.url).toBe(`${TVShow.defaultContainerUrl}the-office/index#it`);
        expect(tvShow.getSlug()).toBe('the-office');
        expect(TVShow.urlFromSlug('the-office')).toBe(`${TVShow.defaultContainerUrl}the-office/index#it`);
        expect(TVShow.urlFromSlug('the-office', { containerUrl: 'local://shows/' })).toBe(
            'local://shows/the-office/index#it',
        );
        expect(TVShow.documentUrlFromSlug('the-office')).toBe(`${TVShow.defaultContainerUrl}the-office/index`);
        expect(TVShow.slugFromUrl(`${TVShow.defaultContainerUrl}the-office/index#it`)).toBe('the-office');
    });

    it('mints container slug urls with custom document slug', async () => {
        // Arrange
        const TVShow = defineSchema({
            fields: {
                name: z.string().useAsContainerSlug({ documentSlug: 'info' }),
            },
        });

        bootModels({ TVShow });

        // Act
        const tvShow = await TVShow.create({ name: 'The Office' });

        // Assert
        expect(tvShow.url).toBe(`${TVShow.defaultContainerUrl}the-office/info#it`);
        expect(tvShow.getSlug()).toBe('the-office');
        expect(TVShow.urlFromSlug('the-office')).toBe(`${TVShow.defaultContainerUrl}the-office/info#it`);
        expect(TVShow.slugFromUrl(`${TVShow.defaultContainerUrl}the-office/info#it`)).toBe('the-office');
    });

    it('creates unique container slug urls when minted urls already exist', async () => {
        // Arrange
        const TVShow = defineSchema({
            fields: {
                name: z.string().useAsContainerSlug(),
            },
        });

        bootModels({ TVShow });

        const existingDocumentUrl = `${TVShow.defaultContainerUrl}the-office/index`;
        const existingDocument = {
            graph: {
                '@id': existingDocumentUrl,
                '@type': 'http://www.w3.org/ns/ldp#Document',
            },
        };

        engine.documents[existingDocumentUrl] = objectDeepClone(existingDocument);

        // Act
        const tvShow = await TVShow.create({ name: 'The Office' });

        // Assert
        expect(tvShow.url).toMatch(
            new RegExp(`^${escapeRegexText(TVShow.defaultContainerUrl)}the-office-[\\w-]+/index#it$`),
        );
        expect(tvShow.getSlug()).toMatch(/^the-office-[\w-]+$/);
        expect(engine.documents[existingDocumentUrl]).toEqual(existingDocument);
        expect(engine.documents[tvShow.requireDocumentUrl()]).toBeDefined();
    });

    it('inherits and overrides container slug configuration in extended schemas', () => {
        // Arrange
        const TVShow = defineSchema({
            fields: {
                name: z.string().useAsContainerSlug({ documentSlug: 'info' }),
            },
        });
        const ExtendedTVShow = defineSchema(TVShow, {
            fields: {
                description: z.string().optional(),
            },
        });
        const DocumentSlugTVShow = defineSchema(TVShow, {
            fields: {
                title: z.string().useAsSlug(),
            },
        });

        // Act
        bootModels({ TVShow, ExtendedTVShow, DocumentSlugTVShow });

        // Assert
        expect(ExtendedTVShow.urlFromSlug('the-office')).toBe(
            `${ExtendedTVShow.defaultContainerUrl}the-office/info#it`,
        );
        expect(DocumentSlugTVShow.urlFromSlug('the-office')).toBe(
            `${DocumentSlugTVShow.defaultContainerUrl}the-office#it`,
        );
    });
});
