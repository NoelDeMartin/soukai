import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { RDFLiteral, RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import { ZodError } from 'zod';

import User from 'soukai-bis/testing/stubs/User';
import { InMemoryEngine, setEngine } from 'soukai-bis/engines';
import { SetPropertyOperation } from 'soukai-bis/models/crdts';
import { bootModels } from 'soukai-bis/models/utils';
import { fakeResourceUrl } from '@noeldemartin/testing';

describe('Model', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();

        setEngine(engine);
        bootModels({ User }, true);
    });

    it('boots models', () => {
        expect(User.defaultContainerUrl).toBe('solid://users/');
        expect(User.modelName).toBe('User');
    });

    it('creates instances', () => {
        const user = new User({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expectTypeOf(user).toExtend<{ name: string; email?: string; age?: number; friendUrls: string[] }>();
    });

    it('validates attributes in constructor', () => {
        expect(() => new User({ name: 'John Doe', email: 'invalid-email' })).toThrow(ZodError);
    });

    it('sets url in constructor', () => {
        const user = new User({ url: 'https://example.com/alice', name: 'Alice' });

        expect(user.url).toBe('https://example.com/alice');
        expect(user.name).toBe('Alice');
    });

    it('serializes to JsonLD', async () => {
        const user = new User({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

        await expect(await user.toJsonLD()).toEqualJsonLD({
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@id': '#it',
            '@type': 'Person',
            'name': 'John Doe',
            'knows': [{ '@id': 'https://example.pod/alice#me' }],
        });
    });

    it('serializes to Turtle', async () => {
        const user = new User({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

        expect(await user.toTurtle()).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#it>
                a foaf:Person ;
                foaf:name "John Doe" ;
                foaf:knows <https://example.pod/alice#me> .
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

        await expect(engine.documents[mintedUser.url]).toEqualJsonLD({
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@id': user.url,
            '@type': 'Person',
            'name': 'John Doe',
        });
    });

    it('updates instances with dirty attributes', async () => {
        // Arrange
        const user = await User.create({ name: 'John Doe', age: 30 });
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        // Act
        await user.update({ name: 'Jane Doe' });

        // Assert
        expect(user.name).toBe('Jane Doe');

        await expect(engine.documents[user.url]).toEqualJsonLD({
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@id': user.url,
            '@type': 'Person',
            'name': 'Jane Doe',
            'age': 30,
        });

        expect(updateDocumentSpy).toHaveBeenCalledWith(
            user.url,
            expect.arrayContaining([
                new SetPropertyOperation(new RDFNamedNode(user.url), new RDFNamedNode(expandIRI('foaf:name')), [
                    new RDFLiteral('Jane Doe'),
                ]),
            ]),
        );
    });

    it('creates instances statically', async () => {
        const user = await User.create({ name: 'John Doe' });

        expect(user.url).not.toBeUndefined();

        await expect(engine.documents[user.url]).toEqualJsonLD({
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@id': user.url,
            '@type': 'Person',
            'name': 'John Doe',
        });
    });

    it('reads all instances', async () => {
        await User.create({ name: 'John Doe' });
        await User.create({ name: 'Jane Doe' });

        const users = await User.all('solid://users/');

        expect(users).toHaveLength(2);
        expect(users[0]).toBeInstanceOf(User);
        expect(users[1]).toBeInstanceOf(User);
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

        const user = await User.createFromJsonLD(jsonld);

        expect(user).toBeInstanceOf(User);
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

        const user = await User.createFromJsonLD(jsonld);

        expect(user).toBeNull();
    });

    it('deletes instances', async () => {
        const user = await User.create({ name: 'John Doe' });

        await user.delete();

        expect(user.exists()).toBe(false);
        expect(engine.documents[user.url]).toBeUndefined();
    });

    it('infers attribute types', () => {
        // @ts-expect-error - name is missing
        () => new User({});

        // @ts-expect-error - foo is not a valid attribute
        () => new User({ name: 'John Doe', foo: 'bar' });
    });

});
