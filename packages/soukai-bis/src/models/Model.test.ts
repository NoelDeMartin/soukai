import { SolidDocument, expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { escapeRegexText, fail, objectDeepClone, required, urlRoute } from '@noeldemartin/utils';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import { XSD_DATE_TIME } from 'soukai-bis/lib/internals/rdf';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import { useFakeClock } from 'soukai-bis/testing/utils/clock';
import { expectOperations } from 'soukai-bis/testing/utils/expectations';
import { metadataJsonLD, tombstoneJsonLD } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import z from 'zod';

import SetPropertyOperation from './crdts/SetPropertyOperation';
import { bootModels, requireBootedModel } from './registry';
import { belongsToMany, belongsToOne, hasMany } from './relations/fluent';
import { defineSchema } from './schema';
import type { ModelWithTimestamps, ModelWithUrl } from './types';

describe('Model', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('boots models', () => {
        expect(User.defaultContainerUrl).toBe('solid://users/');
        expect(User.modelName).toBe('User');
    });

    it('boots extended models', () => {
        const A = defineSchema({});
        const B = defineSchema(A, {});

        bootModels({ A, B });

        expect(A.modelName).toBe('A');
        expect(B.modelName).toBe('B');
    });

    it('defines models with multiple rdf contexts', async () => {
        // Arrange
        const A = defineSchema({
            rdfContexts: {
                default: 'http://vocabs.noeldemartin.com/example-1/',
                example2: 'http://vocabs.noeldemartin.com/example-2/',
            },
            rdfClass: 'Person',
            timestamps: false,
            fields: {
                name: z.string().rdfProperty('example2:name'),
            },
        });

        // Act
        const instance = new A({ url: fakeResourceUrl(), name: 'John Doe' });

        // Assert
        expect(await instance.toTurtle()).toEqualTurtle(`
            @prefix example1: <http://vocabs.noeldemartin.com/example-1/> .
            @prefix example2: <http://vocabs.noeldemartin.com/example-2/> .

            <${instance.url}>
                a example1:Person ;
                example2:name "John Doe" .
        `);
    });

    it('defines models with default solid context', async () => {
        class Stub extends defineSchema({
            timestamps: false,
            fields: {
                name: z.string(),
            },
        }) {}

        bootModels({ Stub });

        const instance = await Stub.create({ name: 'John Doe' });

        await expect(await instance.toJsonLD()).toEqualJsonLD({
            '@id': instance.url,
            '@type': 'http://www.w3.org/ns/solid/terms#Stub',
            'http://www.w3.org/ns/solid/terms#name': 'John Doe',
        });
    });

    it('emits events', async () => {
        // Arrange
        let createCount = 0;
        let updateCount = 0;
        let deleteCount = 0;
        let saveCount = 0;
        const modifiedHistory: string[] = [];

        Post.on('created', () => createCount++);
        Post.on('updated', () => updateCount++);
        Post.on('deleted', () => deleteCount++);
        Post.on('saved', () => saveCount++);
        Post.on('modified', (_, field) => modifiedHistory.push(field));

        // Act
        const post = await Post.create({ title: 'Event Test' });

        await post.update({ title: 'Event Test Updated' });

        await post.delete();

        // Assert
        expect(createCount).toBe(1);
        expect(updateCount).toBe(1);
        expect(saveCount).toBe(2);
        expect(deleteCount).toBe(1);
        expect(modifiedHistory).toContain('title');
    });

    it('emits events for related models', async () => {
        // Arrange
        let createUserCount = 0;
        let saveUserCount = 0;
        let createPostCount = 0;
        let savePostCount = 0;

        User.on('created', () => createUserCount++);
        User.on('saved', () => saveUserCount++);
        Post.on('created', () => createPostCount++);
        Post.on('saved', () => savePostCount++);

        // Act
        const user = await User.create({ name: 'John Doe' });

        user.relatedPosts.related = [];

        await user.relatedPosts.create({ title: 'Event Test' });

        // Assert
        expect(createUserCount).toBe(1);
        expect(saveUserCount).toBe(1);
        expect(createPostCount).toBe(1);
        expect(savePostCount).toBe(1);
    });

    it('creates instances', () => {
        const user = new User({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expectTypeOf(user).toExtend<{
            name: string;
            email?: string;
            age?: number;
            friendUrls?: string[];
        }>();
    });

    it('validates attributes in constructor', () => {
        expect(() => new User({ name: 'John Doe', email: 'invalid-email' })).toThrow(InvalidAttributesError);
    });

    it('sets url in constructor', () => {
        const user = new User({ url: 'https://example.com/alice', name: 'Alice' });

        expect(user.url).toBe('https://example.com/alice');
        expect(user.name).toBe('Alice');
    });

    it('serializes to JsonLD', async () => {
        const user = await User.create({
            name: 'John Doe',
            friendUrls: ['https://example.pod/alice#me'],
        });

        await expect(await user.toJsonLD()).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                crdt: 'https://vocab.noeldemartin.com/crdt/',
                metadata: { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            name: 'John Doe',
            knows: [{ '@id': 'https://example.pod/alice#me' }],
            metadata: {
                '@id': user.url + '-metadata',
                '@type': 'crdt:Metadata',
                'crdt:createdAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.createdAt?.toISOString(),
                },
                'crdt:updatedAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.updatedAt?.toISOString(),
                },
            },
        });
    });

    it('serializes to Turtle', async () => {
        const user = await User.create({
            name: 'John Doe',
            friendUrls: ['https://example.pod/alice#me'],
        });
        const documentUrl = user.requireDocumentUrl();

        expect(await user.toTurtle()).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${documentUrl}#it>
                a foaf:Person ;
                foaf:name "John Doe" ;
                foaf:knows <https://example.pod/alice#me> .

            <${documentUrl}#it-metadata>
                a crdt:Metadata ;
                crdt:resource <${documentUrl}#it> ;
                crdt:createdAt "[[.*]]"^^xsd:dateTime ;
                crdt:updatedAt "[[.*]]"^^xsd:dateTime .
        `);
    });

    it('has typed constructors', () => {
        expectTypeOf(User).toBeConstructibleWith({ name: 'John' });
        expectTypeOf(User).toBeConstructibleWith({ name: 'John', age: 30 });
        expectTypeOf({ name: 123 }).not.toExtend<ConstructorParameters<typeof User>[0]>();
        expectTypeOf({ undefinedField: true }).not.toExtend<ConstructorParameters<typeof User>[0]>();
    });

    it('saves instances', async () => {
        const user = new User({ name: 'John Doe' });
        const mintedUser = await user.save();

        expect(mintedUser.url).not.toBeUndefined();

        await expect(engine.documents[mintedUser.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                crdt: 'https://vocab.noeldemartin.com/crdt/',
                metadata: { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            name: 'John Doe',
            metadata: {
                '@id': user.url + '-metadata',
                '@type': 'crdt:Metadata',
                'crdt:createdAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.createdAt?.toISOString(),
                },
                'crdt:updatedAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.updatedAt?.toISOString(),
                },
            },
        });
    });

    it('updates instances with dirty attributes', async () => {
        // Arrange
        useFakeClock();

        const user = (await User.create({ name: 'John Doe', age: 30 })) as ModelWithTimestamps<User> &
            ModelWithUrl<User>;
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        // Act
        vi.advanceTimersByTime(1);
        await user.update({ name: 'Jane Doe' });

        // Assert
        expect(user.name).toBe('Jane Doe');

        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                crdt: 'https://vocab.noeldemartin.com/crdt/',
                metadata: { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            name: 'Jane Doe',
            age: 30,
            metadata: {
                '@id': user.url + '-metadata',
                '@type': 'crdt:Metadata',
                'crdt:createdAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.createdAt?.toISOString(),
                },
                'crdt:updatedAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.updatedAt?.toISOString(),
                },
            },
        });

        expect(updateDocumentSpy).toHaveBeenCalledWith(user.requireDocumentUrl(), expect.any(Array));
        expectOperations(updateDocumentSpy.mock.calls[0]?.[1], [
            new SetPropertyOperation({
                resourceUrl: user.url,
                property: expandIRI('foaf:name'),
                value: ['Jane Doe'],
                date: user.updatedAt,
            }),
            new SetPropertyOperation({
                resourceUrl: `${user.url}-metadata`,
                property: expandIRI('crdt:updatedAt'),
                value: [user.updatedAt],
                date: user.updatedAt,
            }),
        ]);
    });

    it('saves instances when document exists', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const firstUser = new User({
            url: `${documentUrl}#first`,
            name: 'John Doe',
        }) as ModelWithTimestamps<User> & ModelWithUrl<User>;
        const secondUser = new User({
            url: `${documentUrl}#second`,
            name: 'Jane Doe',
        }) as ModelWithTimestamps<User> & ModelWithUrl<User>;
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const createDocumentSpy = vi.spyOn(engine, 'createDocument');

        engine.documents[documentUrl] = { graph: await firstUser.toJsonLD() };

        secondUser.setDocumentExists(true);

        // Act
        await secondUser.save();

        // Assert
        expect(secondUser.createdAt).toEqual(secondUser.updatedAt);

        await expect(engine.documents[documentUrl]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': firstUser.url,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'John Doe',
                },
                {
                    '@id': secondUser.url,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'Jane Doe',
                    'http://xmlns.com/foaf/0.1/knows': [],
                },
                metadataJsonLD(firstUser),
                metadataJsonLD(secondUser),
            ],
        });

        expect(createDocumentSpy).not.toHaveBeenCalled();
        expect(updateDocumentSpy).toHaveBeenCalledWith(documentUrl, expect.any(Array));
        expectOperations(updateDocumentSpy.mock.calls[0]?.[1], [
            new SetPropertyOperation({
                resourceUrl: secondUser.url,
                property: expandIRI('rdf:type'),
                value: [expandIRI('foaf:Person')],
                date: secondUser.createdAt,
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: secondUser.url,
                property: expandIRI('foaf:name'),
                value: [secondUser.name],
                date: secondUser.createdAt,
            }),
            new SetPropertyOperation({
                resourceUrl: `${secondUser.url}-metadata`,
                property: expandIRI('rdf:type'),
                value: [expandIRI('crdt:Metadata')],
                date: secondUser.createdAt,
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: `${secondUser.url}-metadata`,
                property: expandIRI('crdt:resource'),
                value: [secondUser.url],
                date: secondUser.createdAt,
            }),
            new SetPropertyOperation({
                resourceUrl: `${secondUser.url}-metadata`,
                property: expandIRI('crdt:createdAt'),
                value: [secondUser.createdAt],
                date: secondUser.createdAt,
            }),
            new SetPropertyOperation({
                resourceUrl: `${secondUser.url}-metadata`,
                property: expandIRI('crdt:updatedAt'),
                value: [secondUser.updatedAt],
                date: secondUser.createdAt,
            }),
        ]);
    });

    it('retries saving as update when document already exists', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');
        const createDocumentSpy = vi.spyOn(engine, 'createDocument');

        engine.documents[documentUrl] = {
            graph: {
                '@id': documentUrl,
                '@type': 'http://www.w3.org/ns/ldp#Document',
            },
        };

        // Act
        const user = await User.create({ url: `${documentUrl}#it`, name: 'Jane Doe' });

        // Assert
        await expect(engine.documents[documentUrl]?.graph).toEqualJsonLD({
            '@graph': [
                {
                    '@id': documentUrl,
                    '@type': 'http://www.w3.org/ns/ldp#Document',
                },
                {
                    '@id': user.url,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'Jane Doe',
                    'http://xmlns.com/foaf/0.1/knows': [],
                },
                metadataJsonLD(user as ModelWithTimestamps & ModelWithUrl<User>),
            ],
        });

        expect(createDocumentSpy).toHaveBeenCalledTimes(1);
        expect(updateDocumentSpy).toHaveBeenCalledTimes(1);
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
        const Song = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'MusicRecording',
            fields: {
                title: z.string().rdfProperty('name').useAsSlug(),
            },
            relations: {
                playlists: hasMany(() => requireBootedModel('Playlist'), 'songUrls'),
            },
        });
        const Playlist = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'MusicPlaylist',
            fields: {
                name: z.string(),
                songUrls: z.array(z.url()).rdfProperty('track').default([]),
            },
            relations: {
                songs: belongsToMany(Song, 'songUrls'),
            },
        });

        bootModels({ Song, Playlist });

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
        const Track = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'MusicRecording',
            fields: {
                title: z.string().rdfProperty('name').useAsSlug(),
            },
        });
        const Album = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'MusicAlbum',
            fields: {
                name: z.string(),
                trackUrls: z.array(z.url()).rdfProperty('track').default([]),
            },
            relations: {
                tracks: belongsToMany(Track, 'trackUrls'),
            },
        });

        bootModels({ Track, Album });

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

    it('creates instances statically', async () => {
        const user = await User.create({ name: 'John Doe' });

        expect(user.url).not.toBeUndefined();

        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                crdt: 'https://vocab.noeldemartin.com/crdt/',
                metadata: { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            name: 'John Doe',
            metadata: {
                '@id': user.url + '-metadata',
                '@type': 'crdt:Metadata',
                'crdt:createdAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.createdAt?.toISOString(),
                },
                'crdt:updatedAt': {
                    '@type': XSD_DATE_TIME,
                    '@value': user.updatedAt?.toISOString(),
                },
            },
        });
    });

    it('reads all instances', async () => {
        await User.create({ name: 'John Doe' });
        await User.create({ name: 'Jane Doe' });

        const users = await User.all();

        expect(users).toHaveLength(2);
        expect(users[0]).toBeInstanceOf(User);
        expect(users[1]).toBeInstanceOf(User);
        expect(users.map((user) => user.name)).toEqual(expect.arrayContaining(['John Doe', 'Jane Doe']));
    });

    it('reads all instances reporting invalid documents', async () => {
        // Arrange
        const invalidDocumentUrl = `${User.defaultContainerUrl}invalid`;
        const onDocumentError = vi.fn();

        await User.create({ name: 'John Doe' });
        await engine.createDocument(
            invalidDocumentUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${invalidDocumentUrl}#it> a foaf:Person ; foaf:age "Unknown" .
            `),
        );

        // Act
        const users = await User.all({ onDocumentError });

        // Assert
        expect(users.map((user) => user.name)).toEqual(['John Doe']);
        expect(onDocumentError).toHaveBeenCalledOnce();
        expect(onDocumentError).toHaveBeenCalledWith(expect.any(InvalidAttributesError), invalidDocumentUrl);
        await expect(User.all()).rejects.toThrow(InvalidAttributesError);
    });

    it('reads all instances recursively with depth limit', async () => {
        const rootContainer = User.defaultContainerUrl;

        await User.createAt(rootContainer, { name: 'Root Person' });
        await User.createAt(`${rootContainer}sub1/`, { name: 'Sub 1 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/`, { name: 'Sub 2 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/sub3/`, { name: 'Sub 3 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/sub3/sub4/`, { name: 'Sub 4 Person' });

        const shallowUsers = await User.all();
        const usersAtDepth1 = await User.all({ depth: 1 });
        const usersAtDepth2 = await User.all({ depth: 2 });
        const allUsers = await User.all({ deep: true });

        expect(shallowUsers).toHaveLength(1);
        expect(shallowUsers.map((user) => user.name)).toEqual(['Root Person']);

        expect(usersAtDepth1).toHaveLength(2);
        expect(usersAtDepth1.map((user) => user.name)).toEqual(expect.arrayContaining(['Root Person', 'Sub 1 Person']));

        expect(usersAtDepth2).toHaveLength(3);
        expect(usersAtDepth2.map((user) => user.name)).toEqual(
            expect.arrayContaining(['Root Person', 'Sub 1 Person', 'Sub 2 Person']),
        );

        expect(allUsers).toHaveLength(5);
        expect(allUsers.map((user) => user.name)).toEqual(
            expect.arrayContaining(['Root Person', 'Sub 1 Person', 'Sub 2 Person', 'Sub 3 Person', 'Sub 4 Person']),
        );
    });

    it('creates instances from JsonLD', async () => {
        const jsonld = {
            '@id': fakeResourceUrl(),
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': 'Alice',
            'http://xmlns.com/foaf/0.1/age': 30,
            'http://xmlns.com/foaf/0.1/knows': [
                { '@id': 'https://example.com/bob#me' },
                { '@id': 'https://example.com/charlie#me' },
            ],
        };

        const user = await User.createFromJsonLD(jsonld);

        expect(user).toBeInstanceOf(User);
        expect(user?.url).toBe(jsonld['@id']);
        expect(user?.name).toBe('Alice');
        expect(user?.age).toBe(30);
        expect(user?.friendUrls).toEqual(['https://example.com/bob#me', 'https://example.com/charlie#me']);
        expect(user?.exists()).toBe(true);
    });

    it('does not duplicate metadata models when loading from documents', async () => {
        // Arrange
        const url = fakeResourceUrl();
        const rdf = await turtleToQuads(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${url}>
                a foaf:Person ;
                foaf:name "Alice" .

            <${url}-metadata>
                a crdt:Metadata ;
                crdt:resource <${url}> ;
                crdt:createdAt "2021-01-30T11:47:24Z"^^xsd:dateTime ;
                crdt:updatedAt "2021-01-30T11:47:24Z"^^xsd:dateTime .
        `);

        // Act
        const user = await User.createFromRDF(rdf, { url });

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user?.getDocumentModels()).toHaveLength(2);
    });

    it('updates legacy instances without metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix purl: <http://purl.org/dc/terms/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <${url}>
                    a foaf:Person ;
                    foaf:name "Alice" ;
                    purl:created "2020-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    purl:modified "2020-01-02T00:00:00.000Z"^^xsd:dateTime .
            `),
        );

        const user = await User.findOrFail(url);
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        await user.save();

        expect(updateDocumentSpy).not.toHaveBeenCalled();
        expect(user.isDirty()).toBe(false);
        expect(user.metadata).toBeFalsy();
        expect(user.createdAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
        expect(user.updatedAt).toEqual(new Date('2020-01-02T00:00:00.000Z'));

        // Act
        await user.update({ name: 'Alice Cooper' });

        // Assert
        const freshUser = await user.fresh();

        expect(freshUser.name).toEqual('Alice Cooper');
        expect(freshUser.metadata?.url).toEqual(`${url}-metadata`);
        expect(freshUser.createdAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
        expect(freshUser.updatedAt).toEqual(user.updatedAt);
        expect(freshUser.updatedAt?.getTime()).toBeGreaterThan(new Date('2020-01-02T00:00:00.000Z').getTime());
    });

    it('returns null when creating instances from mismatched JsonLD', async () => {
        const url = 'https://example.com/post';
        const jsonld = {
            '@id': url,
            '@type': 'http://xmlns.com/foaf/0.1/Post',
            'http://xmlns.com/foaf/0.1/name': 'A Post',
        };

        const user = await User.createFromJsonLD(jsonld);

        expect(user).toBeNull();
    });

    it('deletes instances', async () => {
        const user = await User.create({ name: 'John Doe' });

        await user.delete();

        expect(user.exists()).toBe(false);
        expect(engine.documents[user.requireDocumentUrl()]).toBeUndefined();
    });

    it('deletes instances in shared documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const alice = await User.create({ url: `${documentUrl}#alice`, name: 'Alice' });
        const bob = await User.create({ url: `${documentUrl}#bob`, name: 'Bob' });

        await alice.delete();

        expect(alice.exists()).toBe(false);
        await expect(engine.documents[documentUrl]?.graph).toEqualJsonLD(await bob.toJsonLD());
    });

    it('leaves tombstones behind when deleting instances', async () => {
        class UserWithTombstone extends defineSchema(User, { history: true }) {}

        bootModels({ UserWithTombstone });

        const user = (await UserWithTombstone.create({
            name: 'John Doe',
        })) as ModelWithUrl<UserWithTombstone>;

        await user.delete();

        expect(user.exists()).toBe(false);
        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(user)],
        });
    });

    it('deletes instances marked for deletion when saving', async () => {
        const user = await User.create({ name: 'John Doe' });

        user.markForDeletion();

        const documentBeforeSave = engine.documents[user.requireDocumentUrl()];

        await user.save();

        expect(documentBeforeSave).toBeDefined();
        expect(user.exists()).toBe(false);
        expect(engine.documents[user.requireDocumentUrl()]).toBeUndefined();
    });

    it('syncs CRDT operations', async () => {
        class UserWithHistory extends defineSchema(User, { history: true }) {}

        bootModels({ UserWithHistory });

        const documentUrl = 'solid://users/alice';
        const quads = await turtleToQuads(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${documentUrl}#it>
                a foaf:Person ;
                foaf:name "Second Name" .

            <${documentUrl}#it-metadata>
                a crdt:Metadata ;
                crdt:resource <${documentUrl}#it> ;
                crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:updatedAt "2021-01-03T00:00:00.000Z"^^xsd:dateTime .

            <${documentUrl}#operation-3>
                a crdt:SetPropertyOperation ;
                crdt:resource <${documentUrl}#it> ;
                crdt:property foaf:name ;
                crdt:value "Third Name" ;
                crdt:date "2021-01-03T00:00:00.000Z"^^xsd:dateTime .

            <${documentUrl}#operation-2>
                a crdt:SetPropertyOperation ;
                crdt:resource <${documentUrl}#it> ;
                crdt:property foaf:name ;
                crdt:value "Second Name" ;
                crdt:date "2021-01-02T00:00:00.000Z"^^xsd:dateTime .

            <${documentUrl}#operation-1>
                a crdt:SetPropertyOperation ;
                crdt:resource <${documentUrl}#it> ;
                crdt:property foaf:name ;
                crdt:value "First Name" ;
                crdt:date "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
        `);

        await engine.createDocument(documentUrl, quads);

        const user = await UserWithHistory.findOrFail(`${documentUrl}#it`);

        expect(user.name).toEqual('Second Name');

        // Act
        await user.syncOperations();

        // Assert
        expect(user.name).toEqual('Third Name');
    });

    it('mints urls using the slug field', async () => {
        const post = await Post.create({ title: 'Hello World' });

        expect(post.url).toBe('solid://posts/hello-world#it');
    });

    it('gets urls from slugs', async () => {
        const post = await Post.create({ title: 'Hello World' });
        const collection = await PostsCollection.create({ name: 'Drafts' });

        expect(Post.urlFromSlug('hello-world')).toEqual(post.url);
        expect(Post.urlFromSlug('hello-world', { containerUrl: 'solid://drafts/' })).toEqual(
            'solid://drafts/hello-world#it',
        );
        expect(PostsCollection.urlFromSlug('drafts')).toEqual(collection.url);
    });

    it('infers attribute types for extended schemas', () => {
        // Arrange
        class Animal extends defineSchema({ fields: { name: z.string() } }) {
            public get displayName(): string {
                return this.name;
            }
        }

        class Dog extends defineSchema(Animal, { fields: { breed: z.string().optional() } }) {}
        class Puppy extends defineSchema(Dog, { fields: { ageInWeeks: z.number() } }) {}

        // Act
        const dog = new Dog({ name: 'Rex' });
        const puppy = new Puppy({ name: 'Bolt', ageInWeeks: 8 });

        dog.setAttributes({ name: 'Max', breed: 'Beagle' });
        puppy.setAttributes({ name: 'Bolt', breed: 'Husky', ageInWeeks: 9 });

        // Assert
        expect(dog.getAttributes()).toEqual({ name: 'Max', breed: 'Beagle' });
        expect(puppy.getAttributes()).toEqual({ name: 'Bolt', breed: 'Husky', ageInWeeks: 9 });
        expect(puppy.displayName).toEqual('Bolt');

        expectTypeOf(dog.getAttributes()).toHaveProperty('name').toEqualTypeOf<string>();
        expectTypeOf(dog.getAttributes()).toHaveProperty('breed').toEqualTypeOf<string | undefined>();
        expectTypeOf(dog.getAttributes()).not.toHaveProperty('ageInWeeks');
        expectTypeOf(dog.getDirtyAttributes()).items.toEqualTypeOf<'url' | 'name' | 'breed'>();

        expectTypeOf(puppy.getAttributes()).toHaveProperty('name').toEqualTypeOf<string>();
        expectTypeOf(puppy.getAttributes()).toHaveProperty('breed').toEqualTypeOf<string | undefined>();
        expectTypeOf(puppy.getAttributes()).toHaveProperty('ageInWeeks').toEqualTypeOf<number>();
        expectTypeOf(puppy.getDirtyAttributes()).items.toEqualTypeOf<'url' | 'name' | 'breed' | 'ageInWeeks'>();
        expectTypeOf(puppy.displayName).toEqualTypeOf<string>();

        // @ts-expect-error - ageInWeeks is not a Dog attribute
        () => dog.setAttributes({ ageInWeeks: 3 });
    });

    it('infers relation types for extended schemas', () => {
        // Arrange
        const Animal = defineSchema({
            fields: { ownerUrl: z.url().optional() },
            relations: { owner: belongsToOne(() => User, 'ownerUrl') },
        });
        const Dog = defineSchema(Animal, {
            fields: { motherUrl: z.url().optional() },
            relations: { mother: belongsToOne(() => Animal, 'motherUrl') },
        });

        // Act
        const dog = new Dog();

        // Assert
        expectTypeOf(dog.getRelation).parameter(0).toEqualTypeOf<'owner' | 'mother'>();
        expectTypeOf(dog.isRelationLoaded).parameter(0).toEqualTypeOf<'owner' | 'mother'>();

        // @ts-expect-error - posts is not a Dog relation
        () => dog.getRelation('posts');
    });

    it('infers attribute types', () => {
        // @ts-expect-error - name is missing
        () => new User({});

        // @ts-expect-error - foo is not a valid attribute
        () => new User({ name: 'John Doe', foo: 'bar' });
    });

    it('uses class engines', async () => {
        const engine1 = new InMemoryEngine();
        const engine2 = new InMemoryEngine();

        User.setEngine(engine1);
        Post.setEngine(engine2);

        const user = await User.create({ name: 'John Doe' });
        const post = await Post.create({ title: 'Hello World' });

        expect(user.exists()).toBe(true);
        expect(post.exists()).toBe(true);
        expect(engine1.documents[user.requireDocumentUrl()]).not.toBeUndefined();
        expect(engine1.documents[post.requireDocumentUrl()]).toBeUndefined();
        expect(engine2.documents[user.requireDocumentUrl()]).toBeUndefined();
        expect(engine2.documents[post.requireDocumentUrl()]).not.toBeUndefined();

        User.setEngine(undefined);
        Post.setEngine(undefined);
    });

    it('ignores undefined fields on constructor', async () => {
        const user = new User({ name: 'John Doe', email: undefined });

        expect(user.email).toBeUndefined();
        expect(user.getAttributes()).not.toHaveProperty('email');
        expect(user.getDirtyAttributes()).not.toContain('email');
    });

    it('ignores undefined fields on updates', async () => {
        const user = new User({ name: 'John Doe' });

        user.setAttribute('email', undefined);

        expect(user.email).toBeUndefined();
        expect(user.getAttributes()).not.toHaveProperty('email');
        expect(user.getDirtyAttributes()).not.toContain('email');
    });

    it('caches instances by model class, not only url', async () => {
        // Arrange
        const Guest = defineSchema(User, {});
        const url = fakeResourceUrl();
        const rdf = await turtleToQuads(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <${url}>
                a foaf:Person ;
                foaf:name "Alice" .
        `);

        bootModels({ Guest });

        // Act
        const modelsCache = new Map();
        const user = await User.createFromRDF(rdf, { url, modelsCache });
        const guest = await Guest.createFromRDF(rdf, { url, modelsCache });

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user).not.toBeInstanceOf(Guest);
        expect(guest).toBeInstanceOf(Guest);
    });
});
