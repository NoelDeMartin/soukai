import { turtleToQuads } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine, setRemoteEngine } from 'soukai-bis/engines/state';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import { XSD_DATE_TIME } from 'soukai-bis/lib/internals/rdf';
import { getSchema } from 'soukai-bis/models/internals/model';
import Animal from 'soukai-bis/testing/stubs/Animal';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import z from 'zod';

import type Model from './Model';
import type { ModelConstructorOptions } from './Model';
import { bootModels } from './registry';
import { belongsToOne } from './relations/fluent';
import { TimestampFields, defineSchema } from './schema';
import type { ModelWithTimestamps, ModelWithUrl } from './types';

describe('Model', () => {
    const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

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
        // Arrange
        class Stub extends defineSchema({
            timestamps: false,
            fields: {
                name: z.string(),
            },
        }) {}

        bootModels({ Stub });

        // Act
        const instance = await Stub.create({ name: 'John Doe' });

        // Assert
        await expect(await instance.toJsonLD()).toEqualJsonLD({
            '@id': instance.url,
            '@type': 'http://www.w3.org/ns/solid/terms#Stub',
            'http://www.w3.org/ns/solid/terms#name': 'John Doe',
        });
    });

    it('converts models to rdf', async () => {
        // Arrange
        const user = await User.create({ name: 'Alice' });

        // Act
        const quads = await user.toRDF();
        const parsedUser = await User.createFromRDF(quads, { url: user.url });

        // Assert
        expectTypeOf(quads).toEqualTypeOf<Quad[]>();
        expect(quads.every((quad) => quad.graph.termType === 'DefaultGraph')).toBe(true);
        expect(quads.some((quad) => quad.subject.value === user.url)).toBe(true);
        expect(quads.some((quad) => quad.subject.value === `${user.url}-metadata`)).toBe(true);
        expect(parsedUser?.name).toEqual('Alice');
        expect(parsedUser?.createdAt).toEqual(user.createdAt);
    });

    it('creates models from turtle', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#it>
                a foaf:Person ;
                foaf:name "Alice" .
        `;

        // Act
        const user = await User.createFromTurtle(turtle, { url: `${documentUrl}#it` });
        const missing = await User.createFromTurtle(turtle, { url: `${documentUrl}#other` });

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user?.url).toEqual(`${documentUrl}#it`);
        expect(user?.name).toEqual('Alice');
        expect(missing).toBeNull();

        expectTypeOf(user).toEqualTypeOf<ModelWithUrl<User> | null>();
    });

    it('creates many models from turtle', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#alice> a foaf:Person ; foaf:name "Alice" .
            <#bob> a foaf:Person ; foaf:name "Bob" .
            <#movie> a <https://schema.org/Movie> .
        `;

        // Act
        const users = await User.createManyFromTurtle(turtle, { baseIRI: documentUrl });

        // Assert
        expect(users.map(({ url, name }) => [url, name])).toEqual([
            [`${documentUrl}#alice`, 'Alice'],
            [`${documentUrl}#bob`, 'Bob'],
        ]);

        expectTypeOf(users).toEqualTypeOf<ModelWithUrl<User>[]>();
    });

    it('creates many models from json-ld', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const json = {
            '@graph': [
                {
                    '@id': `${documentUrl}#alice`,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'Alice',
                },
                {
                    '@id': `${documentUrl}#bob`,
                    '@type': 'http://xmlns.com/foaf/0.1/Person',
                    'http://xmlns.com/foaf/0.1/name': 'Bob',
                },
                {
                    '@id': `${documentUrl}#movie`,
                    '@type': 'https://schema.org/Movie',
                },
            ],
        };

        // Act
        const users = await User.createManyFromJsonLD(json);

        // Assert
        expect(users.map(({ url, name }) => [url, name])).toEqual([
            [`${documentUrl}#alice`, 'Alice'],
            [`${documentUrl}#bob`, 'Bob'],
        ]);

        expectTypeOf(users).toEqualTypeOf<ModelWithUrl<User>[]>();
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
        // Act
        const user = new User({ name: 'John Doe' });

        // Assert
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

    it('serializes to JsonLD', async () => {
        // Arrange
        const user = await User.create({
            name: 'John Doe',
            friendUrls: ['https://example.pod/alice#me'],
        });

        // Act & Assert
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
        // Arrange
        const user = await User.create({
            name: 'John Doe',
            friendUrls: ['https://example.pod/alice#me'],
        });
        const documentUrl = user.requireDocumentUrl();

        // Act & Assert
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

    it('enables only some timestamps', async () => {
        // Arrange
        class CreatedStub extends defineSchema({
            rdfContext: 'https://schema.org/',
            timestamps: ['createdAt'],
            fields: {
                name: z.string(),
            },
        }) {}

        class UpdatedStub extends defineSchema({
            rdfContext: 'https://schema.org/',
            timestamps: [TimestampFields.UpdatedAt],
            fields: {
                name: z.string(),
            },
        }) {}

        bootModels({ CreatedStub, UpdatedStub });

        const createdStub = await CreatedStub.create({ name: 'Created' });
        const updatedStub = await UpdatedStub.create({ name: 'Updated' });
        const originalCreatedAt = createdStub.createdAt;
        const originalUpdatedAt = updatedStub.updatedAt;

        // Act
        vi.advanceTimersByTime(1);
        await createdStub.update({ name: 'Created (edited)' });
        await updatedStub.update({ name: 'Updated (edited)' });

        // Assert
        expect(createdStub.hasTimestamps()).toBe(true);
        expect(createdStub.createdAt).toEqual(originalCreatedAt);
        expect(createdStub.updatedAt).toBeUndefined();
        expect(createdStub.metadata?.updatedAt).toBeUndefined();

        expect(updatedStub.hasTimestamps()).toBe(true);
        expect(updatedStub.createdAt).toBeUndefined();
        expect(updatedStub.updatedAt).toBeInstanceOf(Date);
        expect(updatedStub.updatedAt).not.toEqual(originalUpdatedAt);
        expect(updatedStub.metadata?.createdAt).toBeUndefined();

        expect(await createdStub.toTurtle()).toEqualTurtle(`
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${createdStub.url}>
                a schema:CreatedStub ;
                schema:name "Created (edited)" .

            <${createdStub.url}-metadata>
                a crdt:Metadata ;
                crdt:resource <${createdStub.url}> ;
                crdt:createdAt "${originalCreatedAt?.toISOString()}"^^xsd:dateTime .
        `);
    });

    it('treats empty timestamps as disabled', () => {
        const Stub = defineSchema({ timestamps: [] });

        bootModels({ Stub });

        expect(getSchema(Stub).timestamps).toBe(false);
        expect(new Stub().hasTimestamps()).toBe(false);
    });

    it('infers timestamp types from schemas', () => {
        // Arrange
        class AllStub extends defineSchema({}) {}
        class CreatedStub extends defineSchema({ timestamps: [TimestampFields.CreatedAt] }) {}
        class DisabledStub extends defineSchema({ timestamps: false }) {}
        class InheritedStub extends defineSchema(CreatedStub, {}) {}
        class HooksStub extends defineSchema({
            timestamps: [TimestampFields.CreatedAt],
            hooks: {
                beforeSave() {
                    expectTypeOf(this).toExtend<Model<Record<string, unknown>, Record<string, unknown>, 'createdAt'>>();
                },
            },
        }) {}

        const stub = new CreatedStub();

        // Assert
        expectTypeOf<ModelWithTimestamps<AllStub>['createdAt']>().toEqualTypeOf<Date>();
        expectTypeOf<ModelWithTimestamps<AllStub>['updatedAt']>().toEqualTypeOf<Date>();
        expectTypeOf<ModelWithTimestamps<CreatedStub>['createdAt']>().toEqualTypeOf<Date>();
        expectTypeOf<ModelWithTimestamps<CreatedStub>['updatedAt']>().toEqualTypeOf<Date | undefined>();
        expectTypeOf<ModelWithTimestamps<DisabledStub>['createdAt']>().toEqualTypeOf<Date | undefined>();
        expectTypeOf<ModelWithTimestamps<InheritedStub>['updatedAt']>().toEqualTypeOf<Date | undefined>();
        expectTypeOf<ModelWithTimestamps<HooksStub>['createdAt']>().toEqualTypeOf<Date>();

        if (stub.hasTimestamp('createdAt')) {
            expectTypeOf(stub.createdAt).toEqualTypeOf<Date>();
            expectTypeOf(stub.updatedAt).toEqualTypeOf<Date | undefined>();
        }
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

    it('unsets attributes', async () => {
        // Arrange
        const user = await User.create({ name: 'John Doe', email: 'john@example.com' });

        // Act
        user.unsetAttribute('email');

        // Assert
        expect(user.email).toBeUndefined();
        expect(user.getAttributes()).not.toHaveProperty('email');
        expect(user.isDirty('email')).toBe(true);
    });

    it('touches timestamps', async () => {
        // Arrange
        const createdAt = new Date('2020-01-01T00:00:00.000Z');
        const touchedAt = new Date('2020-01-02T00:00:00.000Z');
        const user = new User({ name: 'John Doe' });

        await user.save({ date: createdAt });

        // Act
        user.touch(touchedAt);

        // Assert
        expect(user.createdAt).toEqual(createdAt);
        expect(user.updatedAt).toEqual(touchedAt);
        expect(user.isDirty()).toBe(true);
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
        expect(Manager.getRDFClasses()).toEqual(['https://example.org/vocab#Manager']);
        expect(Guest.getRDFClasses()).toEqual(['http://xmlns.com/foaf/0.1/Person']);
        expect(people.map(({ url }) => url)).toEqual([
            'https://alice.example/profile#me',
            'https://bob.example/profile#me',
        ]);
        expect(managers.map(({ url }) => url)).toEqual([
            'https://bob.example/profile#me',
            'https://carol.example/profile#me',
        ]);
    });

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
