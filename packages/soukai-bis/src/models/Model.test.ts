import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { expandIRI } from '@noeldemartin/solid-utils';
import { ZodError } from 'zod';

import Post from 'soukai-bis/testing/stubs/Post';
import Person from 'soukai-bis/testing/stubs/Person';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
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
        expect(Person.defaultContainerUrl).toBe('solid://persons/');
        expect(Person.modelName).toBe('Person');
    });

    it('boots extended models', () => {
        const A = defineSchema({});
        const B = defineSchema(A, {});

        bootModels({ A, B });

        expect(A.modelName).toBe('A');
        expect(B.modelName).toBe('B');
    });

    it('creates instances', () => {
        const user = new Person({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expectTypeOf(user).toExtend<{ name: string; email?: string; age?: number; friendUrls: string[] }>();
    });

    it('validates attributes in constructor', () => {
        expect(() => new Person({ name: 'John Doe', email: 'invalid-email' })).toThrow(ZodError);
    });

    it('sets url in constructor', () => {
        const user = new Person({ url: 'https://example.com/alice', name: 'Alice' });

        expect(user.url).toBe('https://example.com/alice');
        expect(user.name).toBe('Alice');
    });

    it('serializes to JsonLD', async () => {
        const user = await Person.create({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

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
        const user = await Person.create({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });
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
        expectTypeOf(Person).toBeConstructibleWith({ name: 'John' });
        expectTypeOf(Person).toBeConstructibleWith({ name: 'John', age: 30 });
        expectTypeOf({ name: 123 }).not.toExtend<ConstructorParameters<typeof Person>[0]>();
        expectTypeOf({ undefinedField: true }).not.toExtend<ConstructorParameters<typeof Person>[0]>();
    });

    it('saves instances', async () => {
        const user = new Person({ name: 'John Doe' });
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
        const user = (await Person.create({ name: 'John Doe', age: 30 })) as ModelWithTimestamps<Person> &
            ModelWithUrl<Person>;
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
        const firstUser = new Person({ url: `${documentUrl}#first`, name: 'John Doe' }) as ModelWithTimestamps<Person> &
            ModelWithUrl<Person>;
        const secondUser = new Person({
            url: `${documentUrl}#second`,
            name: 'Jane Doe',
        }) as ModelWithTimestamps<Person> & ModelWithUrl<Person>;
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
                resourceUrl: secondUser.url,
                property: expandIRI('foaf:knows'),
                value: [],
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

    it('creates instances statically', async () => {
        const user = await Person.create({ name: 'John Doe' });

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
        await Person.create({ name: 'John Doe' });
        await Person.create({ name: 'Jane Doe' });

        const users = await Person.all();

        expect(users).toHaveLength(2);
        expect(users[0]).toBeInstanceOf(Person);
        expect(users[1]).toBeInstanceOf(Person);
        expect(users.map((user) => user.name)).toEqual(expect.arrayContaining(['John Doe', 'Jane Doe']));
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

        const user = await Person.createFromJsonLD(jsonld);

        expect(user).toBeInstanceOf(Person);
        expect(user?.url).toBe(jsonld['@id']);
        expect(user?.name).toBe('Alice');
        expect(user?.age).toBe(30);
        expect(user?.friendUrls).toEqual(['https://example.com/bob#me', 'https://example.com/charlie#me']);
        expect(user?.exists()).toBe(true);
    });

    it('returns null when creating instances from mismatched JsonLD', async () => {
        const url = 'https://example.com/post';
        const jsonld = {
            '@id': url,
            '@type': 'http://xmlns.com/foaf/0.1/Post',
            'http://xmlns.com/foaf/0.1/name': 'A Post',
        };

        const user = await Person.createFromJsonLD(jsonld);

        expect(user).toBeNull();
    });

    it('deletes instances', async () => {
        const user = await Person.create({ name: 'John Doe' });

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
        () => new Person({});

        // @ts-expect-error - foo is not a valid attribute
        () => new Person({ name: 'John Doe', foo: 'bar' });
    });

    it('uses class engines', async () => {
        const engine1 = new InMemoryEngine();
        const engine2 = new InMemoryEngine();

        Person.setEngine(engine1);
        Post.setEngine(engine2);

        const person = await Person.create({ name: 'John Doe' });
        const post = await Post.create({ title: 'Hello World' });

        expect(person.exists()).toBe(true);
        expect(post.exists()).toBe(true);
        expect(engine1.documents[person.requireDocumentUrl()]).not.toBeUndefined();
        expect(engine1.documents[post.requireDocumentUrl()]).toBeUndefined();
        expect(engine2.documents[person.requireDocumentUrl()]).toBeUndefined();
        expect(engine2.documents[post.requireDocumentUrl()]).not.toBeUndefined();

        Person.setEngine(undefined);
        Post.setEngine(undefined);
    });

});
