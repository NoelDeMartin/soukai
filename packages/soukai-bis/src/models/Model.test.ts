import { SolidDocument, expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { escapeRegexText, fail, invade, objectDeepClone, required, urlRoute } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine, setRemoteEngine } from 'soukai-bis/engines/state';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import NonAuthoritativeDocument from 'soukai-bis/errors/NonAuthoritativeDocument';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { XSD_DATE_TIME } from 'soukai-bis/lib/internals/rdf';
import Animal from 'soukai-bis/testing/stubs/Animal';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Playlist from 'soukai-bis/testing/stubs/Playlist';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import Project from 'soukai-bis/testing/stubs/Project';
import BaseRating from 'soukai-bis/testing/stubs/Rating';
import Review from 'soukai-bis/testing/stubs/Review';
import Show from 'soukai-bis/testing/stubs/Show';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { useFakeClock } from 'soukai-bis/testing/utils/clock';
import { expectOperations } from 'soukai-bis/testing/utils/expectations';
import { metadataJsonLD, tombstoneJsonLD } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import z from 'zod';

import type PropertyOperation from './crdts/PropertyOperation';
import SetPropertyOperation from './crdts/SetPropertyOperation';
import { allOf, anyOf } from './matching/fluent';
import type Model from './Model';
import type { ModelConstructorOptions } from './Model';
import { bootModels } from './registry';
import { belongsToMany, belongsToOne } from './relations/fluent';
import { remote } from './remote';
import { defineSchema } from './schema';
import type { ModelWithTimestamps, ModelWithUrl } from './types';

describe('Model', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('boots models', () => {
        expect(User.defaultContainerUrl).toBe('local://users/');
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

    it('emits events when relation models are set manually', async () => {
        // Arrange
        const loadedRelations: unknown[] = [];
        const user = await User.create({ name: 'Alice' });
        const post = await Post.create({ title: 'Hello World' });

        User.on('relation-loaded', (_, relation) => loadedRelations.push(relation));

        // Act
        await user.setRelationModels('posts', [post]);

        // Assert
        expect(user.isRelationLoaded('posts')).toBe(true);
        expect(user.posts).toEqual([post]);
        expect(loadedRelations).toHaveLength(1);
        expect(loadedRelations[0]).toBe(user.relatedPosts);
    });

    it('infers loaded relation types', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        await Post.create({ title: 'Hello World', authorUrl: user.url });

        // Act
        const posts = await user.loadRelation('posts');
        const author = await required(posts[0]).loadRelationIfUnloaded('author');

        // Assert
        expect(posts).toHaveLength(1);
        expect(author?.url).toEqual(user.url);

        expectTypeOf(posts).toEqualTypeOf<Post[]>();
        expectTypeOf(author).toEqualTypeOf<User | null>();
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

    it('initializes instances', async () => {
        // Arrange
        class Recipe extends defineSchema({
            rdfContext: 'https://schema.org/',
            fields: { name: z.string() },
        }) {
            declare public nameLength: number;
            declare public usesLegacyVocabulary: boolean;

            protected initialize(attributes?: Record<string, unknown>, options?: ModelConstructorOptions): void {
                super.initialize(attributes, options);

                this.nameLength = this._attributes.name.length;
                this.usesLegacyVocabulary = !!options?.source?.some((quad) =>
                    quad.predicate.value.startsWith('http://schema.org/'),
                );
            }
        }

        bootModels({ Recipe });

        const documentUrl = fakeDocumentUrl();
        const legacyQuads = await turtleToQuads(
            `
                <#it>
                    a <https://schema.org/Recipe> ;
                    <https://schema.org/name> "Ramen" ;
                    <http://schema.org/recipeYield> "1 serving" .
            `,
            { baseIRI: documentUrl },
        );

        // Act
        const recipe = new Recipe({ name: 'Ramen' });
        const legacyRecipe = required(await Recipe.createFromRDF(legacyQuads, { url: `${documentUrl}#it` }));

        // Assert
        expect(recipe.nameLength).toBe(5);
        expect(recipe.usesLegacyVocabulary).toBe(false);
        expect(recipe.getAttributes()).toEqual({ url: undefined, name: 'Ramen' });
        expect(legacyRecipe.nameLength).toBe(5);
        expect(legacyRecipe.usesLegacyVocabulary).toBe(true);
        expect(legacyRecipe.exists()).toBe(true);
    });

    it('treats undeclared properties as class properties', () => {
        // Arrange
        class Recipe extends defineSchema({ fields: { name: z.string() } }) {
            declare public assignedInInitializer: string;
            declare public notAssignedInInitializer?: string;
            public withDefault: string | null = null;

            protected initialize(attributes?: Record<string, unknown>, options?: ModelConstructorOptions): void {
                super.initialize(attributes, options);

                this.assignedInInitializer = 'initial';
            }
        }

        bootModels({ Recipe });

        const recipe = new Recipe({ name: 'Ramen' }, { exists: true });
        const untypedRecipe = recipe as Recipe & { undeclared?: string };

        // Act
        recipe.assignedInInitializer = 'foo';
        recipe.notAssignedInInitializer = 'bar';
        recipe.withDefault = 'baz';
        untypedRecipe.undeclared = 'qux';

        // Assert
        expect(recipe.assignedInInitializer).toBe('foo');
        expect(recipe.notAssignedInInitializer).toBe('bar');
        expect(recipe.withDefault).toBe('baz');
        expect(untypedRecipe.undeclared).toBe('qux');
        expect(recipe.getAttributes()).toEqual({ name: 'Ramen' });
        expect(recipe.getDirtyAttributes()).toEqual([]);

        delete untypedRecipe.undeclared;

        expect(untypedRecipe.undeclared).toBeUndefined();
        expect('undeclared' in recipe).toBe(false);
    });

    it('fails writing magic properties', () => {
        const user = new User({ name: 'Alice' }) as unknown as Record<string, unknown>;

        expect(() => (user.createdAt = new Date())).toThrow(SoukaiError);
        expect(() => (user.posts = [])).toThrow(SoukaiError);
        expect(() => (user.relatedPosts = null)).toThrow(SoukaiError);
        expect(() => (user.postTitles = [])).toThrow(SoukaiError);
        expect(() => delete user.posts).toThrow(SoukaiError);
        expect(user.posts).toBeUndefined();
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

    it('saves instances in containers', async () => {
        // Arrange
        const containerUrl = 'local://inbox/';

        // Act
        const user = await new User({ name: 'John Doe' }).save(containerUrl, { postToContainer: true });

        // Assert
        expect(user.requireContainerUrl()).toEqual(containerUrl);
        expect(user.exists()).toBe(true);
        expect(engine.documents[user.requireDocumentUrl()]).toBeDefined();
    });

    it('saves instances in containers with unique urls', async () => {
        // Arrange
        const containerUrl = 'local://inbox/';
        const url = `${containerUrl}john#it`;

        await new User({ url, name: 'John Doe' }).save(containerUrl, { postToContainer: true });

        // Act
        const user = await new User({ url, name: 'Jane Doe' }).save(containerUrl, { postToContainer: true });

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

    it('fails posting instances to containers when their document exists', async () => {
        // Arrange
        const user = await User.create({ name: 'John Doe' });

        user.setAttribute('name', 'Jane Doe');

        // Act & Assert
        await expect(user.save(user.requireContainerUrl(), { postToContainer: true })).rejects.toThrow(SoukaiError);
    });

    it('fails posting instances to containers when their url is in a different container', async () => {
        // Arrange
        const user = new User({ url: 'local://inbox/john#it', name: 'John Doe' });

        // Act & Assert
        await expect(user.save('local://outbox/', { postToContainer: true })).rejects.toThrow(SoukaiError);
        expect(user.exists()).toBe(false);
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

    it('reads instances from specific documents', async () => {
        // Arrange
        const listUrl = `${User.defaultContainerUrl}list`;
        const aliceUrl = `${User.defaultContainerUrl}alice#it`;
        const john = await User.create({ name: 'John Doe' });

        await engine.createDocument(
            listUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${aliceUrl}> a foaf:Person ; foaf:name "Alice" .
            `),
        );

        // Act
        const users = await User.all({ $in: [john.requireDocumentUrl(), listUrl, fakeDocumentUrl()] });

        // Assert
        expect(users).toHaveLength(2);

        const alice = required(users.find((user) => user.url === aliceUrl));
        const freshJohn = required(users.find((user) => user.url === john.url));

        expect(alice.name).toBe('Alice');
        expect(alice.getSourceDocumentUrl()).toBe(listUrl);
        expect(alice.getSourceContainerUrl()).toBe(User.defaultContainerUrl);
        expect(alice.isInAuthoritativeDocument()).toBe(false);
        expect(freshJohn.name).toBe('John Doe');
        expect(freshJohn.getSourceDocumentUrl()).toBe(john.requireDocumentUrl());
        expect(freshJohn.isInAuthoritativeDocument()).toBe(true);
    });

    it('tracks the source document of saved instances', async () => {
        const user = new User({ name: 'John Doe' });

        expect(user.getSourceDocumentUrl()).toBeNull();
        expect(user.isInAuthoritativeDocument()).toBeNull();

        await user.save();

        expect(user.getSourceDocumentUrl()).toBe(user.requireDocumentUrl());
        expect(user.metadata?.getSourceDocumentUrl()).toBe(user.requireDocumentUrl());
        expect(user.isInAuthoritativeDocument()).toBe(true);
    });

    it('fails writing instances read from non-authoritative documents', async () => {
        // Arrange
        const listUrl = `${User.defaultContainerUrl}list`;
        const aliceUrl = `${User.defaultContainerUrl}alice#it`;

        await engine.createDocument(
            listUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${aliceUrl}> a foaf:Person ; foaf:name "Alice" .
            `),
        );

        const document = JSON.stringify(engine.documents[listUrl]);
        const [alice] = await User.all({ $in: [listUrl] });

        // Act & Assert
        await expect(required(alice).save()).resolves.toBe(alice);
        await expect(required(alice).update({ name: 'Alice Doe' })).rejects.toThrow(NonAuthoritativeDocument);
        await expect(required(alice).delete()).rejects.toThrow(NonAuthoritativeDocument);
        await expect(required(alice).syncOperations()).rejects.toThrow(NonAuthoritativeDocument);
        await expect(required(alice).fetchPermissions()).rejects.toThrow(
            'Fetching permissions of models in non-authoritative documents is not supported',
        );
        expect(JSON.stringify(engine.documents[listUrl])).toEqual(document);
        expect(engine.documents[urlRoute(aliceUrl)]).toBeUndefined();
    });

    it('refreshes instances from their source document', async () => {
        // Arrange
        const listUrl = `${User.defaultContainerUrl}list`;
        const aliceUrl = `${User.defaultContainerUrl}alice#it`;

        await engine.createDocument(
            listUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${aliceUrl}> a foaf:Person ; foaf:name "Alice" .
            `),
        );

        const [alice] = await User.all({ $in: [listUrl] });

        // Act
        const freshAlice = await required(alice).fresh();

        // Assert
        expect(freshAlice.name).toBe('Alice');
        expect(freshAlice.getSourceDocumentUrl()).toBe(listUrl);
    });

    it('keeps the source document when serializing instances', async () => {
        // Arrange
        const listUrl = `${User.defaultContainerUrl}list`;

        await engine.createDocument(
            listUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${User.defaultContainerUrl}alice#it> a foaf:Person ; foaf:name "Alice" .
            `),
        );

        const [alice] = await User.all({ $in: [listUrl] });

        const john = await User.create({ name: 'John Doe' });

        // Act
        const hydratedAlice = await User.hydrate(required(alice).serialize());
        const hydratedJohn = await User.hydrate(john.serialize());

        // Assert
        expect(hydratedAlice.getSourceDocumentUrl()).toBe(listUrl);
        expect(hydratedAlice.isInAuthoritativeDocument()).toBe(false);
        expect(hydratedJohn.getSourceDocumentUrl()).toBe(john.requireDocumentUrl());
        expect(hydratedJohn.isInAuthoritativeDocument()).toBe(true);
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

    it('leaves tombstones behind when deleting instances without history', async () => {
        class UserWithTombstone extends defineSchema(User, { tombstone: true }) {}

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

    it('removes metadata and operations when deleting instances', async () => {
        class UserWithHistory extends defineSchema(User, { history: true }) {}

        bootModels({ UserWithHistory });

        const user = (await UserWithHistory.create({
            name: 'John Doe',
        })) as ModelWithUrl<UserWithHistory>;

        await user.update({ name: 'Jane Doe' });

        const freshUser = await UserWithHistory.findOrFail(user.url);

        await freshUser.loadRelationIfUnloaded('operations');

        const deletedOperations = freshUser.operations ?? [];

        await freshUser.delete();

        expect(user.operations).not.toHaveLength(0);
        expect(deletedOperations).not.toHaveLength(0);
        expect(freshUser.metadata?.exists()).toBe(false);
        expect(deletedOperations.every((operation) => !operation.exists())).toBe(true);
        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(freshUser)],
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

        const documentUrl = 'local://users/alice';
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

        expect(post.url).toBe('local://posts/hello-world#it');
    });

    it('gets urls from slugs', async () => {
        const post = await Post.create({ title: 'Hello World' });
        const collection = await PostsCollection.create({ name: 'Drafts' });

        expect(Post.urlFromSlug('hello-world')).toEqual(post.url);
        expect(Post.urlFromSlug('hello-world', { containerUrl: 'local://drafts/' })).toEqual(
            'local://drafts/hello-world#it',
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
        const Dog = defineSchema(Animal, {
            fields: { motherUrl: z.url().optional() },
            relations: { mother: belongsToOne('Animal', 'motherUrl') },
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

    it('uses the remote engine for remote models', () => {
        // Arrange
        const localEngine = new InMemoryEngine();
        const remoteEngine = new SolidEngine({ fetch: FakeServer.fetch });

        class RemoteUser extends User {
            public static override remote = true;
        }

        setEngine(localEngine);
        setRemoteEngine(remoteEngine);

        // Act
        const userEngine = User.requireEngine();
        const remoteUserEngine = RemoteUser.requireEngine();

        // Assert
        expect(userEngine).toBe(localEngine);
        expect(remoteUserEngine).toBe(remoteEngine);
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

    it('serializes multiple rdf classes', async () => {
        // Arrange
        const Person = defineSchema({
            rdfContexts: { foaf: 'http://xmlns.com/foaf/0.1/', schema: 'https://schema.org/' },
            rdfClasses: ['foaf:Person', 'schema:Person'],
            timestamps: false,
        });

        bootModels({ Person });

        // Act
        const turtle = await new Person({ url: 'https://alice.example/profile#me' }).toTurtle();

        // Assert
        expect(turtle).toContain('<http://xmlns.com/foaf/0.1/Person>');
        expect(turtle).toContain('<https://schema.org/Person>');
    });

    it('creates models from RDF with all their rdf classes', async () => {
        // Arrange
        const Person = defineSchema({
            rdfContexts: { foaf: 'http://xmlns.com/foaf/0.1/', schema: 'https://schema.org/' },
            rdfClasses: ['foaf:Person', 'schema:Person'],
            timestamps: false,
        });
        const rdf = await turtleToQuads(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix schema: <https://schema.org/> .

            <https://alice.example/profile#me> a foaf:Person, schema:Person .
            <https://bob.example/profile#me> a foaf:Person .
        `);

        bootModels({ Person });

        // Act
        const people = await Person.createManyFromRDF(rdf);
        const bob = await Person.createFromRDF(rdf, { url: 'https://bob.example/profile#me' });

        // Assert
        expect(people.map(({ url }) => url)).toEqual(['https://alice.example/profile#me']);
        expect(bob).toBeNull();
    });

    it('replaces rdf classes in extended models', async () => {
        // Arrange
        const Person = defineSchema({
            rdfContext: 'http://xmlns.com/foaf/0.1/',
            rdfClass: 'Person',
            timestamps: false,
        });
        const Manager = defineSchema(Person, {
            rdfContext: 'https://example.org/vocab#',
            rdfClass: 'Manager',
        });
        const Guest = defineSchema(Person, {});
        const rdf = await turtleToQuads(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix ex: <https://example.org/vocab#> .

            <https://alice.example/profile#me> a foaf:Person .
            <https://bob.example/profile#me> a foaf:Person, ex:Manager .
            <https://carol.example/profile#me> a ex:Manager .
        `);

        bootModels({ Person, Manager, Guest });

        // Act
        const people = await Person.createManyFromRDF(rdf);
        const managers = await Manager.createManyFromRDF(rdf);

        // Assert
        expect(Manager.getRdfClasses()).toEqual(['https://example.org/vocab#Manager']);
        expect(Guest.getRdfClasses()).toEqual(['http://xmlns.com/foaf/0.1/Person']);
        expect(people.map(({ url }) => url)).toEqual([
            'https://alice.example/profile#me',
            'https://bob.example/profile#me',
        ]);
        expect(managers.map(({ url }) => url)).toEqual([
            'https://bob.example/profile#me',
            'https://carol.example/profile#me',
        ]);
    });

    describe('soft deletes', () => {
        const Rating = defineSchema(BaseRating, { history: true });

        async function operationNames(model: Model | null | undefined): Promise<string[]> {
            await model?.loadRelation('operations');

            return (model?.operations ?? []).map((operation) => operation.static('modelName'));
        }

        beforeEach(() => {
            useFakeClock();
            bootModels({ Rating }, { reset: true });
        });

        it('soft deletes instances', async () => {
            // Arrange
            const action = await WatchAction.create({ startTime: new Date() });

            vi.advanceTimersByTime(1000);

            // Act
            await action.softDelete();

            // Assert
            const freshAction = await WatchAction.find(action.url, { includeSoftDeleted: true });

            expect(action.isSoftDeleted()).toBe(true);
            expect(action.isDirty()).toBe(false);
            expect(action.metadata?.deletedAt).toEqual(new Date());
            expect(await WatchAction.find(action.url)).toBeNull();
            expect(await WatchAction.all()).toHaveLength(0);
            expect(await WatchAction.all({ includeSoftDeleted: true })).toHaveLength(1);
            expect(freshAction?.isSoftDeleted()).toBe(true);
            expect(freshAction?.metadata?.deletedAt).toEqual(new Date());
            expect(await operationNames(freshAction)).toContain('SoftDeleteOperation');
        });

        it('restores soft deleted instances', async () => {
            // Arrange
            const action = await WatchAction.create({ startTime: new Date() });

            vi.advanceTimersByTime(1000);
            await action.softDelete();
            vi.advanceTimersByTime(1000);

            // Act
            await action.restore();

            // Assert
            const freshAction = await WatchAction.find(action.url);

            expect(action.isSoftDeleted()).toBe(false);
            expect(freshAction?.isSoftDeleted()).toBe(false);
            expect(freshAction?.metadata?.deletedAt).toBeUndefined();
            expect(await operationNames(freshAction)).toEqual(
                expect.arrayContaining(['SoftDeleteOperation', 'RestoreOperation']),
            );
        });

        it('emits updated events', async () => {
            // Arrange
            const action = await WatchAction.create({ startTime: new Date() });
            const listener = vi.fn();

            WatchAction.on('updated', listener);

            // Act
            await action.softDelete();
            await action.restore();

            // Assert
            expect(listener).toHaveBeenCalledTimes(2);
        });

        it('requires history and timestamps', async () => {
            // Arrange
            const movie = await Movie.create({ title: 'Spirited Away' });

            // Act & Assert
            await expect(movie.softDelete()).rejects.toThrow(SoukaiError);
        });

        it('skips soft deleted instances in relations', async () => {
            // Arrange
            const movie = await Movie.create({ title: 'Spirited Away' });
            const action = await movie.relatedAction.create({ startTime: new Date() });

            await action.softDelete();

            // Act
            const freshMovie = await Movie.findOrFail(movie.url);

            // Assert
            expect(freshMovie.isRelationLoaded('action')).toBe(true);
            expect(freshMovie.action).toBeNull();
        });

        it('loads belongsTo relations in the same document with soft deleted instances', async () => {
            // Arrange
            const review = new Review({ itemReviewedUrl: 'https://example.com/movie' });
            const rating = review.relatedRating.attach({ ratingValue: 5 });

            await review.save();
            await rating.softDelete();

            // Act
            const freshReview = await Review.findOrFail(review.requireUrl());

            // Assert
            expect(freshReview.isRelationLoaded('rating')).toBe(true);
            expect(freshReview.rating).toBeNull();
            expect(freshReview.reviewRatingUrl).toEqual(rating.url);
        });

        it('keeps soft deletes after schema migrations', async () => {
            // Arrange
            const OtherWatchAction = defineSchema(WatchAction, { rdfDefaultResourceHash: 'action' });
            const action = await WatchAction.create({ startTime: new Date() });

            await action.softDelete();

            // Act
            const migrated = await action.migrateSchema(OtherWatchAction);

            // Assert
            expect(migrated.url).not.toEqual(action.url);
            expect(migrated.isSoftDeleted()).toBe(true);
            expect(await operationNames(migrated)).toContain('SoftDeleteOperation');
        });

        it('reverts soft deletes when saving fails', async () => {
            // Arrange
            const action = await WatchAction.create({ startTime: new Date() });

            vi.advanceTimersByTime(1000);
            vi.spyOn(engine, 'updateDocument').mockRejectedValueOnce(new Error('Saving failed'));

            // Act
            await expect(action.softDelete()).rejects.toThrow('Saving failed');

            // Assert
            vi.advanceTimersByTime(1000);
            await action.update({ startTime: new Date() });

            expect(action.isSoftDeleted()).toBe(false);
            expect(action.metadata?.deletedAt).toBeUndefined();
            expect(await WatchAction.find(action.url)).not.toBeNull();
        });

        it('prefers soft deletes over restores with the same date', async () => {
            // Arrange
            const documentUrl = fakeDocumentUrl();

            await engine.createDocument(
                documentUrl,
                await turtleToQuads(
                    `
                        @prefix schema: <https://schema.org/> .
                        @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                        <#it> a schema:WatchAction .

                        <#it-metadata>
                            a crdt:Metadata ;
                            crdt:resource <#it> ;
                            crdt:createdAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime ;
                            crdt:updatedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                        <#it-operation-1>
                            a crdt:SoftDeleteOperation ;
                            crdt:resource <#it> ;
                            crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                        <#it-operation-2>
                            a crdt:RestoreOperation ;
                            crdt:resource <#it> ;
                            crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                    `,
                    { baseIRI: documentUrl },
                ),
            );

            const action = required(await WatchAction.find(`${documentUrl}#it`));

            // Act
            await action.syncOperations();

            // Assert
            expect(action.isSoftDeleted()).toBe(true);
            expect(await WatchAction.find(`${documentUrl}#it`)).toBeNull();
        });

        it('compares soft delete dates when syncing operations', async () => {
            // Arrange
            const documentUrl = fakeDocumentUrl();

            await engine.createDocument(
                documentUrl,
                await turtleToQuads(
                    `
                        @prefix schema: <https://schema.org/> .
                        @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                        <#it> a schema:WatchAction .

                        <#it-metadata>
                            a crdt:Metadata ;
                            crdt:resource <#it> ;
                            crdt:createdAt "2022-01-01T00:00:00Z"^^xsd:dateTime ;
                            crdt:updatedAt "2022-01-01T00:00:00Z"^^xsd:dateTime ;
                            crdt:deletedAt "2022-01-01T00:00:00Z"^^xsd:dateTime .

                        <#it-operation-1>
                            a crdt:SoftDeleteOperation ;
                            crdt:resource <#it> ;
                            crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                    `,
                    { baseIRI: documentUrl },
                ),
            );

            const action = required(await WatchAction.find(`${documentUrl}#it`, { includeSoftDeleted: true }));
            const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

            // Act
            await action.syncOperations();

            // Assert
            expect(updateDocumentSpy).not.toHaveBeenCalled();
        });
    });

    describe('type indexes', () => {
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        it('registers models in type indexes', async () => {
            // Arrange
            const movie = new Movie({ url: 'https://alice.example/movies/spirited-away#it', title: 'Spirited Away' });

            setEngine(new SolidEngine({ fetch: FakeServer.fetch }));
            FakeServer.respondWith(typeIndexUrl, (request) =>
                request.method === 'GET'
                    ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                    : FakeResponse.success(),
            );

            // Act
            await movie.register(typeIndexUrl);

            // Assert
            expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
                INSERT DATA {
                    @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                    @prefix schema: <https://schema.org/> .

                    <#[[.*]]> a solid:TypeRegistration;
                        solid:forClass schema:Movie;
                        solid:instance <https://alice.example/movies/spirited-away#it> .
                }
            `);
        });
    });

    describe('wrapped in proxies', () => {
        async function findProjectWithTask() {
            const project = new Project({ name: 'Proxies' });

            project.relatedTasks.attach({ name: 'Fix proxies' });

            const { url } = await project.save();

            return Project.findOrFail(url);
        }

        function wrapInProxy<T extends object>(target: T): T {
            return new Proxy(target, {});
        }

        beforeEach(() => {
            useFakeClock();
        });

        it('collects document models without duplicates', async () => {
            // Arrange
            const project = await findProjectWithTask();

            // Act
            const documentModels = wrapInProxy(project).getDocumentModels();

            // Assert
            expect(documentModels).toHaveLength(4); // project, task, and their metadata
            expect(new Set(documentModels).size).toBe(documentModels.length);
            expect(documentModels).toContain(project);
            expect(documentModels).toContain(project.tasks?.[0]);
        });

        it('records history operations once', async () => {
            // Arrange
            const project = await findProjectWithTask();

            // Act
            vi.advanceTimersByTime(1);
            await wrapInProxy(project).update({ name: 'Proxies (fixed)' });

            // Assert
            const freshProject = await Project.findOrFail(project.url);
            const operations = await freshProject.loadRelation('operations');

            expect(freshProject.name).toBe('Proxies (fixed)');
            expect(operations).toHaveLength(2);
        });

        it('deletes instances', async () => {
            // Arrange
            const project = await findProjectWithTask();

            // Act
            await wrapInProxy(project).delete();

            // Assert
            expect(project.exists()).toBe(false);
            expect(await Project.find(project.url)).toBeNull();
        });

        it('emits events once with the unwrapped instance', async () => {
            // Arrange
            const project = await findProjectWithTask();
            const projectProxy = wrapInProxy(project);
            const classListener = vi.fn();
            const instanceListener = vi.fn();
            const proxyListener = vi.fn();

            Project.on('updated', classListener);
            project.on('updated', instanceListener);
            projectProxy.on('updated', proxyListener);

            // Act
            vi.advanceTimersByTime(1);
            await projectProxy.update({ name: 'Proxies (fixed)' });

            // Assert
            expect(classListener).toHaveBeenCalledTimes(1);
            expect(classListener).toHaveBeenCalledWith(project, undefined);
            expect(instanceListener).toHaveBeenCalledTimes(1);
            expect(proxyListener).toHaveBeenCalledTimes(1);
        });

        it('sets relation models without duplicates', async () => {
            // Arrange
            const project = await findProjectWithTask();
            const task = required(project.tasks?.[0]);

            // Act
            await project.setRelationModels('tasks', [wrapInProxy(task)]);

            // Assert
            expect(project.tasks).toHaveLength(1);
            expect(project.tasks?.[0]).toBe(task);
            expect(task.getRelation('project').related).toBe(project);
        });

        it('attaches and detaches related models', async () => {
            // Arrange
            const project = await findProjectWithTask();
            const task = required(project.tasks?.[0]);

            // Act
            project.relatedTasks.attach(wrapInProxy(task));

            const tasksAfterAttach = project.tasks?.slice();
            const detached = project.relatedTasks.detach(wrapInProxy(task));

            // Assert
            expect(tasksAfterAttach).toEqual([task]);
            expect(detached).toEqual([task]);
            expect(project.tasks).toHaveLength(0);
        });
    });

    describe('hooks', () => {
        const ACTION_STATUS = 'https://schema.org/actionStatus';
        const COMPLETED = 'https://schema.org/CompletedActionStatus';
        const POTENTIAL = 'https://schema.org/PotentialActionStatus';

        const TodoSchema = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Action',
            history: true,
            fields: {
                name: z.string(),
                description: z.string().optional(),
                status: z.string().rdfProperty('actionStatus').optional(),
                completedAt: z.date().rdfProperty('endTime').optional(),
            },
            hooks: {
                beforeInitialize(attributes) {
                    attributes.name ??= attributes.description;
                },
                beforeSave() {
                    this.status = this.completedAt ? COMPLETED : POTENTIAL;
                },
            },
        });

        class Todo extends TodoSchema {}

        async function loadOperations(url: string): Promise<PropertyOperation[]> {
            const todo = await Todo.findOrFail(url);

            return (await todo.loadRelation('operations')) as PropertyOperation[];
        }

        function documentStatements(engine: InMemoryEngine, documentUrl: string): Promise<Quad[]> {
            return engine.readDocument(documentUrl).then((document) => document.getQuads());
        }

        beforeEach(() => {
            bootModels({ Todo }, { reset: true });
        });

        describe('beforeInitialize', () => {
            it('fills in attributes before validating', () => {
                // Act
                // @ts-expect-error The name is filled in by the hook.
                const todo = new Todo({ description: 'Learn Solid' });

                // Assert
                expect(todo.name).toEqual('Learn Solid');
                expect(todo.isDirty('name')).toBe(true);
            });

            it('receives the source quads', async () => {
                // Arrange
                const beforeInitialize = vi.fn();
                const Schema = defineSchema(TodoSchema, { hooks: { beforeInitialize } });
                const quads = await turtleToQuads(`
                    @prefix schema: <https://schema.org/> .

                    <solid://todos/learn-solid#it> a schema:Action ; schema:name "Learn Solid" .
                `);

                class SpiedTodo extends Schema {}

                bootModels({ SpiedTodo });

                // Act
                await SpiedTodo.createFromRDF(quads, { url: 'solid://todos/learn-solid#it' });
                new SpiedTodo({ name: 'Write docs' });

                // Assert
                expect(beforeInitialize).toHaveBeenCalledTimes(2);
                expect(beforeInitialize.mock.calls[0]?.[0]).toMatchObject({ name: 'Learn Solid' });
                expect(beforeInitialize.mock.calls[0]?.[1]).toEqual({ quads });
                expect(beforeInitialize.mock.calls[1]?.[1]).toEqual({ quads: undefined });
            });

            it('does not run when hydrating', async () => {
                // Arrange
                const todo = await Todo.create({ name: 'Learn Solid' });
                const serialized = todo.serialize();
                const beforeInitialize = vi.fn();
                const Schema = defineSchema(TodoSchema, { hooks: { beforeInitialize } });

                Todo.updateSchema(Schema);

                // Act
                const hydrated = await Todo.hydrate(serialized);

                // Assert
                expect(hydrated.name).toEqual('Learn Solid');
                expect(beforeInitialize).not.toHaveBeenCalled();
            });

            it('does not write filled in attributes until they are edited', async () => {
                // Arrange
                useFakeClock();

                const documentUrl = 'solid://todos/learn-solid';
                const url = `${documentUrl}#it`;
                const quads = await turtleToQuads(`
                    @prefix schema: <https://schema.org/> .

                    <${url}> a schema:Action ; schema:description "Learn Solid" .
                `);

                await engine.createDocument(documentUrl, quads);

                // Act
                const todo = required(await Todo.createFromRDF(quads, { url }));
                const serialized = todo.serialize();

                vi.advanceTimersByTime(1000);
                await todo.update({ completedAt: new Date() });

                // Assert
                const statements = await documentStatements(engine, documentUrl);
                const operations = await loadOperations(url);
                const operationProperties = operations.map((operation) => operation.property).sort();

                expect(todo.name).toEqual('Learn Solid');
                expect(serialized.nodes[0]?.staleRdfProperties).toEqual(['https://schema.org/name']);
                expect(statements.some((quad) => quad.predicate.value === 'https://schema.org/name')).toBe(false);
                expect(operationProperties).toEqual([
                    ACTION_STATUS,
                    'https://schema.org/description',
                    'https://schema.org/endTime',
                ]);

                // Act
                await todo.update({ name: 'Learn Solid (again)' });

                // Assert
                const updatedStatements = await documentStatements(engine, documentUrl);

                expect(
                    updatedStatements.find((quad) => quad.predicate.value === 'https://schema.org/name')?.object.value,
                ).toEqual('Learn Solid (again)');
            });

            it('detects attributes modified in place', async () => {
                // Arrange
                const Schema = defineSchema({
                    rdfContext: 'https://schema.org/',
                    rdfClass: 'Action',
                    fields: {
                        name: z.string(),
                        keywords: z.array(z.string()).default([]),
                    },
                    hooks: {
                        beforeInitialize(attributes) {
                            (attributes.keywords as string[] | undefined)?.push('todo');
                        },
                    },
                });
                const url = 'solid://todos/learn-solid#it';
                const quads = await turtleToQuads(`
                    @prefix schema: <https://schema.org/> .

                    <${url}> a schema:Action ; schema:name "Learn Solid" ; schema:keywords "solid" .
                `);
                const keywords = ['docs'];

                class TaggedTodo extends Schema {}

                bootModels({ TaggedTodo });

                // Act
                const todo = required(await TaggedTodo.createFromRDF(quads, { url }));
                const newTodo = new TaggedTodo({ name: 'Write docs', keywords });

                // Assert
                expect(todo.keywords).toEqual(['solid', 'todo']);
                expect(todo.serialize().nodes[0]?.staleRdfProperties).toEqual(['https://schema.org/keywords']);
                expect(newTodo.keywords).toEqual(['docs', 'todo']);
                expect(keywords).toEqual(['docs']);
            });

            it('restores stale RDF properties when hydrating', async () => {
                // Arrange
                const documentUrl = 'solid://todos/learn-solid';
                const url = `${documentUrl}#it`;
                const quads = await turtleToQuads(`
                    @prefix schema: <https://schema.org/> .

                    <${url}> a schema:Action ; schema:description "Learn Solid" .
                `);

                await engine.createDocument(documentUrl, quads);

                const todo = required(await Todo.createFromRDF(quads, { url }));

                // Act
                const hydrated = await Todo.hydrate(todo.serialize());

                await hydrated.update({ completedAt: new Date() });

                // Assert
                const operations = await loadOperations(url);

                expect(operations.map((operation) => operation.property)).not.toContain('https://schema.org/name');
            });
        });

        describe('beforeSave', () => {
            it('derives attributes when saving', async () => {
                // Act
                const todo = await Todo.create({ name: 'Learn Solid' });

                // Assert
                expect(todo.status).toEqual(POTENTIAL);

                // Act
                await todo.update({ completedAt: new Date() });

                // Assert
                const freshTodo = await Todo.findOrFail(todo.url);

                expect(freshTodo.status).toEqual(COMPLETED);
            });

            it('records changes in the same history batch', async () => {
                // Arrange
                useFakeClock();

                const todo = await Todo.create({ name: 'Learn Solid' });

                // Act
                vi.advanceTimersByTime(1000);
                await todo.update({ completedAt: new Date() });

                // Assert
                const freshTodo = await Todo.findOrFail(todo.url);
                const operations = await loadOperations(freshTodo.url);
                const statusOperations = operations
                    .filter((operation) => operation.property === ACTION_STATUS)
                    .sort((a, b) => a.date.getTime() - b.date.getTime());
                const completedAtOperation = required(
                    operations.find((operation) => operation.property === 'https://schema.org/endTime'),
                );

                expect(statusOperations).toHaveLength(2);
                expect(statusOperations[1]?.date).toEqual(completedAtOperation.date);
            });

            it('does not create redundant operations', async () => {
                // Arrange
                useFakeClock();

                const todo = await Todo.create({ name: 'Learn Solid' });

                // Act
                vi.advanceTimersByTime(1000);
                await todo.update({ name: 'Learn Solid (again)' });

                // Assert
                const freshTodo = await Todo.findOrFail(todo.url);
                const operations = await loadOperations(freshTodo.url);

                expect(operations.filter((operation) => operation.property === ACTION_STATUS)).toHaveLength(1);
            });

            it('runs for dirty models in the same document', async () => {
                // Arrange
                const beforeSave = vi.fn();
                const Schema = defineSchema(TaskICalSchema, { hooks: { beforeSave } });

                Task.updateSchema(Schema);

                const project = new Project({ name: 'Solid' });
                const task = project.relatedTasks.attach({ name: 'Learn Solid' });

                const { url } = await project.save();
                const freshProject = await Project.findOrFail(url);
                const [freshTask, deletedTask] = [
                    required(freshProject.tasks?.[0]),
                    freshProject.relatedTasks.attach({ name: 'Delete me' }),
                ];

                await freshProject.save();

                beforeSave.mockClear();
                deletedTask.markForDeletion();
                freshTask.name = 'Learn Solid (again)';

                // Act
                await freshProject.save();

                // Assert
                expect(task.exists()).toBe(true);
                expect(beforeSave).toHaveBeenCalledTimes(1);
                expect(beforeSave.mock.contexts[0]).toBe(freshTask);
            });

            it('does not run on clean models', async () => {
                // Arrange
                const beforeSave = vi.fn();
                const Schema = defineSchema(TaskICalSchema, { hooks: { beforeSave } });

                Task.updateSchema(Schema);

                const task = await Task.create({ name: 'Learn Solid' });

                // Act
                await task.save();

                // Assert
                expect(beforeSave).toHaveBeenCalledTimes(1);
            });
        });

        describe('schemas', () => {
            it('merges hooks when extending schemas', () => {
                // Arrange
                const beforeSave = vi.fn();
                const Schema = defineSchema(TodoSchema, { hooks: { beforeSave } });

                class ExtendedTodo extends Schema {}

                bootModels({ ExtendedTodo });

                // Act
                // @ts-expect-error The name is filled in by the hook.
                const todo = new ExtendedTodo({ description: 'Learn Solid' });

                // Assert
                expect(todo.name).toEqual('Learn Solid');
            });

            it('swaps hooks when updating schemas', async () => {
                // Arrange
                const NoHooksSchema = defineSchema({
                    rdfContext: 'https://schema.org/',
                    rdfClass: 'Action',
                    history: true,
                    fields: {
                        name: z.string().optional(),
                        description: z.string().optional(),
                        status: z.string().rdfProperty('actionStatus').optional(),
                        completedAt: z.date().rdfProperty('endTime').optional(),
                    },
                });

                // Act
                Todo.updateSchema(NoHooksSchema);

                // Assert
                // @ts-expect-error The name is optional in the new schema.
                const todo = await Todo.create({ description: 'Learn Solid' });

                expect(todo.name).toBeUndefined();
                expect(todo.status).toBeUndefined();
            });

            it('uses hooks in remote models', async () => {
                // Arrange
                // @ts-expect-error The name is filled in by the hook.
                const todo = new (remote(Todo))({ description: 'Learn Solid' });

                // Assert
                expect(todo.name).toEqual('Learn Solid');
            });
        });

        it('types hooks', () => {
            defineSchema({
                fields: { name: z.string(), description: z.string().optional() },
                hooks: {
                    beforeInitialize(attributes) {
                        expectTypeOf(attributes.name).toEqualTypeOf<string | undefined>();
                    },
                    beforeSave() {
                        expectTypeOf(this.name).toEqualTypeOf<string>();
                        expectTypeOf(this.description).toEqualTypeOf<string | undefined>();
                    },
                },
            });
        });
    });

    describe('multiple vocabularies', () => {
        const SCHEMA = 'https://schema.org/';
        const ICAL = 'http://www.w3.org/2002/12/cal/ical#';

        const TodoSchema = defineSchema({
            rdfContext: SCHEMA,
            rdfContexts: { ical: ICAL },
            rdfClasses: anyOf(['Action', 'ical:Vtodo']),
            history: true,
            fields: {
                name: z.string().rdfProperties(['name', 'ical:summary']),
                completedAt: z.date().rdfProperties(['endTime', 'ical:completed']).optional(),
                priority: z.string().rdfProperty('ical:priority').optional(),
            },
        });

        class Todo extends TodoSchema {}

        async function loadOperations(url: string): Promise<PropertyOperation[]> {
            const task = await Todo.findOrFail(url);

            return (await task.loadRelation('operations')) as PropertyOperation[];
        }

        function predicateValues(quads: Quad[], predicate: string): string[] {
            return quads.filter((quad) => quad.predicate.value === predicate).map((quad) => quad.object.value);
        }

        beforeEach(() => {
            bootModels({ Todo }, { reset: true });
        });

        describe('RDF classes', () => {
            it('matches resources with any of the classes', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <solid://tasks#one> a schema:Action ; schema:name "One" .
                    <solid://tasks#two> a ical:Vtodo ; ical:summary "Two" .
                    <solid://tasks#three> a schema:Action, ical:Vtodo ; schema:name "Three" .
                    <solid://tasks#four> a schema:Event ; schema:name "Four" .
                `);

                // Act
                const tasks = await Todo.createManyFromRDF(quads);
                const four = await Todo.createFromRDF(quads, { url: 'solid://tasks#four' });

                // Assert
                expect(tasks.map((task) => task.name).sort()).toEqual(['One', 'Three', 'Two']);
                expect(four).toBeNull();
            });

            it('matches resources with all of the classes', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <solid://tasks#one> a schema:Action ; schema:name "One" .
                    <solid://tasks#two> a schema:Action, ical:Vtodo ; schema:name "Two" .
                `);

                for (const rdfClasses of [['Action', 'ical:Vtodo'], allOf(['Action', 'ical:Vtodo'])]) {
                    const Schema = defineSchema(TodoSchema, { rdfClasses });

                    Todo.updateSchema(Schema);

                    // Act
                    const tasks = await Todo.createManyFromRDF(quads);

                    // Assert
                    expect(tasks.map((task) => task.name)).toEqual(['Two']);
                    expect(Todo.matchesRdfClasses([`${SCHEMA}Action`])).toBe(false);
                }
            });

            it('writes all the classes', async () => {
                // Act
                const task = await Todo.create({ name: 'Learn Solid' });

                // Assert
                const document = await engine.readDocument(task.requireDocumentUrl());
                const types = document
                    .statements(task.url, 'rdf:type')
                    .map((statement) => statement.object.value)
                    .sort();

                expect(Todo.getRdfClasses()).toEqual([`${SCHEMA}Action`, `${ICAL}Vtodo`]);
                expect(types).toEqual([`${ICAL}Vtodo`, `${SCHEMA}Action`]);
            });

            it('inherits the rule from parent schemas', () => {
                // Arrange
                const Schema = defineSchema(TodoSchema, { fields: { description: z.string().optional() } });

                class ExtendedTodo extends Schema {}

                bootModels({ ExtendedTodo });

                // Act & Assert
                expect(ExtendedTodo.matchesRdfClasses([`${ICAL}Vtodo`])).toBe(true);
                expect(ExtendedTodo.getRdfClasses()).toEqual(Todo.getRdfClasses());
            });

            it('fails using rdfClass with anyOf', () => {
                expect(() => defineSchema({ rdfClass: 'Action', rdfClasses: anyOf(['Event']) })).toThrow(SoukaiError);
            });
        });

        describe('multiple RDF properties', () => {
            it('reads values from the first property with values', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <solid://tasks#one> a ical:Vtodo ; ical:summary "One" .
                    <solid://tasks#two> a schema:Action ; schema:name "Two" ; ical:summary "Old name" .
                `);

                // Act
                const one = required(await Todo.createFromRDF(quads, { url: 'solid://tasks#one' }));
                const two = required(await Todo.createFromRDF(quads, { url: 'solid://tasks#two' }));

                // Assert
                expect(one.name).toEqual('One');
                expect(two.name).toEqual('Two');
                expect(one.isDirty()).toBe(false);
                expect(two.isDirty()).toBe(false);
                expect(one.getAttributes()).not.toHaveProperty('summary');
            });

            it('writes values to all the properties', async () => {
                // Arrange
                useFakeClock();

                // Act
                const task = await Todo.create({ name: 'Learn Solid', completedAt: new Date() });

                vi.advanceTimersByTime(1000);
                await task.update({ name: 'Learn Solid (again)' });

                // Assert
                const quads = (await engine.readDocument(task.requireDocumentUrl())).getQuads();
                const operations = await loadOperations(task.url);
                const countOperations = (property: string) =>
                    operations.filter((operation) => operation.property === property).length;

                expect(predicateValues(quads, `${SCHEMA}name`)).toEqual(['Learn Solid (again)']);
                expect(predicateValues(quads, `${ICAL}summary`)).toEqual(['Learn Solid (again)']);
                expect(predicateValues(quads, `${SCHEMA}endTime`)).toHaveLength(1);
                expect(predicateValues(quads, `${ICAL}completed`)).toHaveLength(1);
                expect(countOperations(`${SCHEMA}name`)).toEqual(2);
                expect(countOperations(`${ICAL}summary`)).toEqual(2);
                expect(countOperations(`${SCHEMA}endTime`)).toEqual(1);
                expect(countOperations(`${ICAL}completed`)).toEqual(1);
            });

            it('does not upgrade resources until fields are edited', async () => {
                // Arrange
                useFakeClock();

                const documentUrl = 'solid://tasks/learn-solid';
                const url = `${documentUrl}#it`;
                const quads = await turtleToQuads(`
                    @prefix ical: <${ICAL}> .

                    <${url}> a ical:Vtodo ; ical:summary "Learn Solid" .
                `);

                await engine.createDocument(documentUrl, quads);

                const task = required(await Todo.createFromRDF(quads, { url }));

                // Act
                vi.advanceTimersByTime(1000);
                await task.update({ priority: '1' });

                // Assert
                const firstQuads = (await engine.readDocument(documentUrl)).getQuads();
                const firstOperations = await loadOperations(url);

                expect(predicateValues(firstQuads, `${SCHEMA}name`)).toEqual([]);
                expect(
                    predicateValues(
                        firstQuads.filter((quad) => quad.subject.value === url),
                        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
                    ),
                ).toEqual([`${ICAL}Vtodo`]);
                expect(firstOperations.map((operation) => operation.property).sort()).toEqual([
                    `${ICAL}priority`,
                    `${ICAL}summary`,
                ]);

                // Act
                vi.advanceTimersByTime(1000);
                await task.update({ name: 'Learn Solid (again)' });

                // Assert
                const secondQuads = (await engine.readDocument(documentUrl)).getQuads();
                const secondOperations = await loadOperations(url);

                expect(predicateValues(secondQuads, `${SCHEMA}name`)).toEqual(['Learn Solid (again)']);
                expect(predicateValues(secondQuads, `${ICAL}summary`)).toEqual(['Learn Solid (again)']);
                expect(secondOperations.filter((operation) => operation.property === `${SCHEMA}name`)).toHaveLength(1);
                expect(secondOperations.filter((operation) => operation.property === `${ICAL}summary`)).toHaveLength(2);
            });

            it('does not record stale properties in inception operations', async () => {
                // Arrange
                const documentUrl = 'solid://tasks/learn-solid';
                const url = `${documentUrl}#it`;
                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <${url}> a schema:Action, ical:Vtodo ; schema:name "Learn Solid" ; ical:summary "Old name" .
                `);

                await engine.createDocument(documentUrl, quads);

                const task = required(await Todo.createFromRDF(quads, { url }));

                // Act
                await task.update({ priority: '1' });

                // Assert
                const updatedQuads = (await engine.readDocument(documentUrl)).getQuads();
                const operations = await loadOperations(url);

                expect(predicateValues(updatedQuads, `${ICAL}summary`)).toEqual(['Old name']);
                expect(operations.map((operation) => operation.property).sort()).toEqual([
                    `${ICAL}priority`,
                    `${SCHEMA}name`,
                ]);
            });

            it('only keeps stale RDF properties when there are any', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <solid://todos#one> a ical:Vtodo ; ical:summary "One" .
                    <solid://todos#two> a schema:Action, ical:Vtodo ; schema:name "Two" ; ical:summary "Two" .
                `);
                const staleRdfProperties = (todo: Todo) => invade(todo, ['_staleRdfProperties'])._staleRdfProperties;

                // Act
                const one = required(await Todo.createFromRDF(quads, { url: 'solid://todos#one' }));
                const two = required(await Todo.createFromRDF(quads, { url: 'solid://todos#two' }));
                const three = new Todo({ name: 'Three' });

                // Assert
                expect(staleRdfProperties(one)).toEqual(new Set([`${SCHEMA}name`]));
                expect(staleRdfProperties(two)).toBeNull();
                expect(staleRdfProperties(three)).toBeNull();

                // Act
                one.name = 'One (again)';

                // Assert
                expect(staleRdfProperties(one)).toBeNull();
            });

            it('ignores the order of values when detecting stale RDF properties', async () => {
                // Arrange
                const TaggedTodoSchema = defineSchema(TodoSchema, {
                    fields: { keywords: z.array(z.string()).rdfProperties(['keywords', 'ical:categories']).optional() },
                });

                class TaggedTodo extends TaggedTodoSchema {}

                bootModels({ TaggedTodo });

                const quads = await turtleToQuads(`
                    @prefix schema: <${SCHEMA}> .
                    @prefix ical: <${ICAL}> .

                    <solid://todos#one>
                        a schema:Action ;
                        schema:name "One" ;
                        ical:summary "One" ;
                        schema:keywords "solid", "todo" ;
                        ical:categories "todo", "solid" .
                `);

                // Act
                const todo = required(await TaggedTodo.createFromRDF(quads, { url: 'solid://todos#one' }));

                // Assert
                expect(todo.keywords).toEqual(['solid', 'todo']);
                expect(invade(todo, ['_staleRdfProperties'])._staleRdfProperties).toBeNull();
            });

            it('keeps stale RDF properties when hydrating', async () => {
                // Arrange
                const documentUrl = 'solid://tasks/learn-solid';
                const url = `${documentUrl}#it`;
                const quads = await turtleToQuads(`
                    @prefix ical: <${ICAL}> .

                    <${url}> a ical:Vtodo ; ical:summary "Learn Solid" .
                `);

                await engine.createDocument(documentUrl, quads);

                const task = required(await Todo.createFromRDF(quads, { url }));

                // Act
                const hydrated = await Todo.hydrate(task.serialize());

                await hydrated.update({ priority: '1' });

                // Assert
                const operations = await loadOperations(url);

                expect(operations.map((operation) => operation.property)).not.toContain(`${SCHEMA}name`);
            });

            it('inherits and swaps RDF properties', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix ical: <${ICAL}> .

                    <solid://tasks#it> a ical:Vtodo ; ical:summary "Learn Solid" .
                `);
                const ExtendedSchema = defineSchema(TodoSchema, { fields: { description: z.string().optional() } });
                const OverriddenSchema = defineSchema(TodoSchema, { fields: { name: z.string() } });

                class ExtendedTodo extends ExtendedSchema {}

                bootModels({ ExtendedTodo });

                // Act
                const extendedTask = await ExtendedTodo.createFromRDF(quads, { url: 'solid://tasks#it' });

                Todo.updateSchema(OverriddenSchema);

                const overriddenTask = await Todo.createFromRDF(quads, { url: 'solid://tasks#it' }).catch(
                    (error: unknown) => error,
                );

                // Assert
                expect(extendedTask?.name).toEqual('Learn Solid');
                expect(overriddenTask).toBeInstanceOf(Error);
            });

            it('reads values from multiple properties in order', async () => {
                // Arrange
                const quads = await turtleToQuads(`
                    @prefix dc: <http://purl.org/dc/terms/> .

                    <solid://tasks#it> a <${ICAL}Vtodo> ; dc:title "Learn Solid" .
                `);
                const nameDefinition = z.string().rdfProperties(['name', 'ical:summary', 'dc:title']);
                const Schema = defineSchema(TodoSchema, {
                    rdfContexts: { dc: 'http://purl.org/dc/terms/' },
                    fields: { name: nameDefinition },
                });

                Todo.updateSchema(Schema);

                // Act
                const task = await Todo.createFromRDF(quads, { url: 'solid://tasks#it' });

                // Assert
                expect(task?.name).toEqual('Learn Solid');
            });

            it('reads and writes RDF properties in zod definitions', () => {
                const definition = z.string().rdfProperties(['name', 'ical:summary']);

                expect(definition.rdfProperties()).toEqual(['name', 'ical:summary']);
                expect(z.string().rdfProperty('name').rdfProperties()).toEqual(['name']);
                expect(z.string().rdfProperties()).toBeUndefined();
            });
        });
    });
});
