import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import z from 'zod';

import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import { setEngine } from 'soukai-bis/engines/state';
import { XSD_DATE_TIME } from 'soukai-bis/utils/rdf';
import { expectOperations } from 'soukai-bis/testing/utils/expectations';
import { metadataJsonLD } from 'soukai-bis/testing/utils/rdf';

import SetPropertyOperation from './crdts/SetPropertyOperation';
import { defineSchema } from './schema';
import { bootModels } from './registry';
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
        expectTypeOf(user).toExtend<{ name: string; email?: string; age?: number; friendUrls?: string[] }>();
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
        const user = await User.create({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

        await expect(await user.toJsonLD()).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                'crdt': 'https://vocab.noeldemartin.com/crdt/',
                'metadata': { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            'name': 'John Doe',
            'knows': [{ '@id': 'https://example.pod/alice#me' }],
            'metadata': {
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
        const user = await User.create({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });
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
                'crdt': 'https://vocab.noeldemartin.com/crdt/',
                'metadata': { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            'name': 'John Doe',
            'metadata': {
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
        const user = (await User.create({ name: 'John Doe', age: 30 })) as ModelWithTimestamps<User> &
            ModelWithUrl<User>;
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        // Act
        await user.update({ name: 'Jane Doe' });

        // Assert
        expect(user.name).toBe('Jane Doe');

        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                'crdt': 'https://vocab.noeldemartin.com/crdt/',
                'metadata': { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            'name': 'Jane Doe',
            'age': 30,
            'metadata': {
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
        const firstUser = new User({ url: `${documentUrl}#first`, name: 'John Doe' }) as ModelWithTimestamps<User> &
            ModelWithUrl<User>;
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

    it('creates instances statically', async () => {
        const user = await User.create({ name: 'John Doe' });

        expect(user.url).not.toBeUndefined();

        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                'crdt': 'https://vocab.noeldemartin.com/crdt/',
                'metadata': { '@reverse': 'crdt:resource' },
            },
            '@id': user.url,
            '@type': 'Person',
            'name': 'John Doe',
            'metadata': {
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
        expect(engine.documents[user.url]).toBeUndefined();
    });

    it('mints urls using the slug field', async () => {
        const post = await Post.create({ title: 'Hello World' });

        expect(post.url).toBe('solid://posts/hello-world#it');
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

});
