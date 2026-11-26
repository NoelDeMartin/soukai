import { expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { required, urlRoute } from '@noeldemartin/utils';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import NonAuthoritativeDocument from 'soukai-bis/errors/NonAuthoritativeDocument';
import { XSD_DATE_TIME } from 'soukai-bis/lib/internals/rdf';
import User from 'soukai-bis/testing/stubs/User';
import UserWithHistory from 'soukai-bis/testing/stubs/UserWithHistory';
import { engine } from 'soukai-bis/testing/utils/engines';
import { expectOperations } from 'soukai-bis/testing/utils/expectations';
import { metadataJsonLD, tombstoneJsonLD } from 'soukai-bis/testing/utils/rdf';
import { describe, expect, it, vi } from 'vite-plus/test';

import SetPropertyOperation from './crdts/SetPropertyOperation';
import { bootModels } from './registry';
import { defineSchema } from './schema';
import type { ModelWithTimestamps, ModelWithUrl } from './types';

describe('Model CRUD', () => {
    it('saves instances', async () => {
        // Act
        const user = new User({ name: 'John Doe' });
        const mintedUser = await user.save();

        // Assert
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

        expect(updateDocumentSpy).toHaveBeenCalledWith(user.requireDocumentUrl(), expect.any(Array), undefined);
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
        expect(updateDocumentSpy).toHaveBeenCalledWith(documentUrl, expect.any(Array), undefined);
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
        // Act
        const user = await User.create({ name: 'John Doe' });

        // Assert
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
        // Arrange
        await User.create({ name: 'John Doe' });
        await User.create({ name: 'Jane Doe' });

        // Act
        const users = await User.all();

        // Assert
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
        // Arrange
        const rootContainer = User.defaultContainerUrl;

        await User.createAt(rootContainer, { name: 'Root Person' });
        await User.createAt(`${rootContainer}sub1/`, { name: 'Sub 1 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/`, { name: 'Sub 2 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/sub3/`, { name: 'Sub 3 Person' });
        await User.createAt(`${rootContainer}sub1/sub2/sub3/sub4/`, { name: 'Sub 4 Person' });

        // Act
        const shallowUsers = await User.all();
        const usersAtDepth1 = await User.all({ depth: 1 });
        const usersAtDepth2 = await User.all({ depth: 2 });
        const allUsers = await User.all({ deep: true });

        // Assert
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
        // Arrange
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

        // Act
        const user = await User.fromJsonLD(jsonld).find();

        // Assert
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
        const user = await User.fromRDF(rdf).find(url);

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
        // Arrange
        const url = 'https://example.com/post';
        const jsonld = {
            '@id': url,
            '@type': 'http://xmlns.com/foaf/0.1/Post',
            'http://xmlns.com/foaf/0.1/name': 'A Post',
        };

        // Act
        const user = await User.fromJsonLD(jsonld).find();

        // Assert
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
        // Arrange
        const user = (await UserWithHistory.create({
            name: 'John Doe',
        })) as ModelWithUrl<UserWithHistory>;

        // Act
        await user.delete();

        // Assert
        expect(user.exists()).toBe(false);
        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(user)],
        });
    });

    it('leaves tombstones behind when deleting instances without history', async () => {
        // Arrange
        class UserWithTombstone extends defineSchema(User, { tombstone: true }) {}

        bootModels({ UserWithTombstone });

        const user = (await UserWithTombstone.create({
            name: 'John Doe',
        })) as ModelWithUrl<UserWithTombstone>;

        // Act
        await user.delete();

        // Assert
        expect(user.exists()).toBe(false);
        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(user)],
        });
    });

    it('removes metadata and operations when deleting instances', async () => {
        // Arrange
        const user = (await UserWithHistory.create({
            name: 'John Doe',
        })) as ModelWithUrl<UserWithHistory>;

        await user.update({ name: 'Jane Doe' });

        const freshUser = await UserWithHistory.findOrFail(user.url);

        await freshUser.loadRelationIfUnloaded('operations');

        const deletedOperations = freshUser.operations ?? [];

        // Act
        await freshUser.delete();

        // Assert
        expect(user.operations).not.toHaveLength(0);
        expect(deletedOperations).not.toHaveLength(0);
        expect(freshUser.metadata?.exists()).toBe(false);
        expect(deletedOperations.every((operation) => !operation.exists())).toBe(true);
        await expect(engine.documents[user.requireDocumentUrl()]?.graph).toEqualJsonLD({
            '@graph': [tombstoneJsonLD(freshUser)],
        });
    });

    it('deletes instances marked for deletion when saving', async () => {
        // Arrange
        const user = await User.create({ name: 'John Doe' });

        user.markForDeletion();

        const documentBeforeSave = engine.documents[user.requireDocumentUrl()];

        // Act
        await user.save();

        // Assert
        expect(documentBeforeSave).toBeDefined();
        expect(user.exists()).toBe(false);
        expect(engine.documents[user.requireDocumentUrl()]).toBeUndefined();
    });

    it('syncs CRDT operations', async () => {
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
});
