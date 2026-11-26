import { SolidDocument, turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import { belongsToMany, belongsToOne, bootModels, defineSchema } from 'soukai-bis';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MovieWithHistory from 'soukai-bis/testing/stubs/MovieWithHistory';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import { z } from 'zod';

import type { ModelWithUrl } from './types';

describe('ModelBuilder', () => {
    it('enforces url requirement for find() at the type level', () => {
        const quads: Awaited<ReturnType<typeof turtleToQuads>> = [];
        const doc = new SolidDocument('https://alice.example/doc', []);

        // @ts-expect-error url is required for fromRDF().find()
        void (() => User.fromRDF(quads).find());

        // @ts-expect-error url is required for fromTurtle().find()
        void (() => User.fromTurtle('').find());

        // @ts-expect-error url is required for fromDocument().find()
        void (() => User.fromDocument(doc).find());

        // JsonLD allows omitting url (defaults to @id)
        void (() => User.fromJsonLD({ '@id': 'https://alice.example/profile#me' }).find());
        void (() => User.fromJsonLD({ '@id': 'https://alice.example/profile#me' }).find({ includeSoftDeleted: true }));
        void (() => User.fromJsonLD({}).find('https://alice.example/profile#me'));
    });

    it('finds and lists existing models from all RDF formats', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const aliceUrl = `${documentUrl}#alice`;
        const bobUrl = `${documentUrl}#bob`;
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#alice> a foaf:Person ; foaf:name "Alice" .
            <#bob> a foaf:Person ; foaf:name "Bob" .
        `;
        const quads = await turtleToQuads(turtle, { baseIRI: documentUrl });
        const document = new SolidDocument(documentUrl, quads);
        const jsonld = {
            '@id': aliceUrl,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': 'Alice',
        };

        // Act
        const fromRDF = await User.fromRDF(quads).find(aliceUrl);
        const fromTurtle = await User.fromTurtle(turtle).find(aliceUrl);
        const fromJsonLD = await User.fromJsonLD(jsonld).find();
        const fromDocument = await User.fromDocument(document).find(aliceUrl);
        const allFromDocument = await User.fromDocument(document).all();

        // Assert
        for (const user of [fromRDF, fromTurtle, fromJsonLD, fromDocument]) {
            expect(user).toBeInstanceOf(User);
            expect(user?.exists()).toBe(true);
            expect(user?.url).toBe(aliceUrl);
            expect(user?.name).toBe('Alice');
            expectTypeOf(user).toEqualTypeOf<ModelWithUrl<User> | null>();
        }

        expect(allFromDocument.map((user) => user.url)).toEqual([aliceUrl, bobUrl]);
        expectTypeOf(allFromDocument).toEqualTypeOf<ModelWithUrl<User>[]>();
    });

    it('creates new unsaved instances from JsonLD without @id or with blank nodes', async () => {
        // Arrange
        const jsonld = {
            '@context': { '@vocab': 'https://schema.org/' },
            '@type': 'Movie',
            name: 'Spirited Away',
            '@reverse': {
                object: {
                    '@type': 'WatchAction',
                    startTime: '2020-01-01T00:00:00.000Z',
                },
            },
        };

        // Act
        const movie = await Movie.fromJsonLD(jsonld).newInstance();

        // Assert
        expect(movie).toBeInstanceOf(Movie);
        expect(movie?.exists()).toBe(false);
        expect(movie?.url).toBeUndefined();
        expect(movie?.title).toBe('Spirited Away');
        expect(movie?.action?.exists()).toBe(false);
        expect(movie?.action?.url).toBeUndefined();
        expect(movie?.action?.startTime).toEqual(new Date('2020-01-01T00:00:00.000Z'));
        expectTypeOf(movie).toEqualTypeOf<Movie | null>();

        // Saving mints fresh URLs for the whole graph
        const saved = await required(movie).save();
        const fresh = await Movie.findOrFail(saved.url);

        expect(fresh.title).toBe('Spirited Away');
        expect(fresh.action?.url).toMatch(new RegExp(`^${fresh.requireDocumentUrl()}#`));
        expect(fresh.action?.objectUrl).toBe(fresh.url);
        expect(fresh.action?.startTime).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    });

    it('creates new unsaved instances from Turtle with blank nodes and strips old document urls', async () => {
        // Arrange
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            [] a foaf:Person ; foaf:name "Alice" .
            [] a foaf:Person ; foaf:name "Bob" .
        `;

        // Act
        const users = await User.fromTurtle(turtle).newInstances();

        // Assert
        expect(users).toHaveLength(2);
        expect(users.map((user) => user.name)).toEqual(['Alice', 'Bob']);
        expect(users.every((user) => !user.exists() && user.url === undefined)).toBe(true);
        expectTypeOf(users).toEqualTypeOf<User[]>();
    });

    it('resets belongsToMany same-document relations while preserving external references', async () => {
        // Arrange
        const Team = defineSchema({
            rdfContext: 'http://xmlns.com/foaf/0.1/',
            rdfClass: 'Group',
            fields: {
                name: z.string(),
                memberUrls: z.array(z.url()).rdfProperty('member').default([]),
            },
            relations: {
                members: belongsToMany('User', 'memberUrls').usingSameDocument(),
            },
        });

        bootModels({ Team });

        const externalFriendUrl = 'https://external.example/profile#me';
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#group>
                a foaf:Group ;
                foaf:name "Straw Hats" ;
                foaf:member <#luffy>, <${externalFriendUrl}> .

            <#luffy>
                a foaf:Person ;
                foaf:name "Luffy" .
        `;

        // Act
        const group = await Team.fromTurtle(turtle, { baseIRI: 'https://source.example/group' }).create();

        // Assert
        const freshGroup = await Team.findOrFail(required(group).url);

        expect(freshGroup.name).toBe('Straw Hats');
        expect(freshGroup.memberUrls).toContain(externalFriendUrl);
        expect(freshGroup.memberUrls).toHaveLength(2);
        expect(freshGroup.memberUrls.some((url) => url.startsWith('https://source.example/'))).toBe(false);
        expect(freshGroup.members?.map((member) => member.name)).toEqual(['Luffy']);
        expect(freshGroup.members?.[0]?.getDocumentUrl()).toBe(freshGroup.getDocumentUrl());
    });

    it('creates and persists models with create() and createMany()', async () => {
        // Arrange
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <https://source.example/users#alice> a foaf:Person ; foaf:name "Alice" .
            <https://source.example/users#bob> a foaf:Person ; foaf:name "Bob" .
        `;

        // Act
        const single = await User.fromJsonLD({
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@type': 'Person',
            name: 'Carol',
        }).create();
        const many = await User.fromTurtle(turtle).createMany();

        // Assert
        expect(single?.exists()).toBe(true);
        expect(single?.url).toMatch(/^local:\/\/users\//);
        expect((await User.findOrFail(required(single).url)).name).toBe('Carol');
        expectTypeOf(single).toEqualTypeOf<ModelWithUrl<User> | null>();

        expect(many).toHaveLength(2);
        expect(many.every((user) => user.exists() && user.url.startsWith('local://users/'))).toBe(true);
        expect((await User.all()).map((user) => user.name).sort()).toEqual(['Alice', 'Bob', 'Carol']);
        expectTypeOf(many).toEqualTypeOf<ModelWithUrl<User>[]>();
    });

    it('does not carry over CRDT operations when creating a new instance from existing RDF', async () => {
        // Arrange
        const original = await MovieWithHistory.create({ title: 'Spirited Away' });

        await original.update({ title: 'Sen to Chihiro' });

        const quads = await original.toRDF();

        // Act
        const copy = await MovieWithHistory.fromRDF(quads).create();

        // Assert
        const freshCopy = await MovieWithHistory.findOrFail(required(copy).url);

        expect(freshCopy.url).not.toBe(original.url);
        expect(freshCopy.title).toBe('Sen to Chihiro');
        expect(await freshCopy.loadRelation('operations')).toHaveLength(0);
    });

    it('isolates shared same-document related models across newInstances() and createMany()', async () => {
        // Arrange
        const Film = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Movie',
            fields: {
                title: z.string().rdfProperty('name'),
                directorUrl: z.url().rdfProperty('director').optional(),
            },
            relations: {
                director: belongsToOne('User', 'directorUrl').usingSameDocument(),
            },
        });

        bootModels({ Film });

        const turtle = `
            @prefix schema: <https://schema.org/> .
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#spirited-away>
                a schema:Movie ;
                schema:name "Spirited Away" ;
                schema:director <#miyazaki> .

            <#totoro>
                a schema:Movie ;
                schema:name "My Neighbor Totoro" ;
                schema:director <#miyazaki> .

            <#miyazaki>
                a foaf:Person ;
                foaf:name "Hayao Miyazaki" .
        `;

        // Act
        const drafts = await Film.fromTurtle(turtle, { baseIRI: 'https://source.example/films' }).newInstances();
        const saved = await Film.fromTurtle(turtle, { baseIRI: 'https://source.example/films' }).createMany();

        // Assert
        expect(drafts).toHaveLength(2);
        expect(drafts[0]?.director).not.toBe(drafts[1]?.director);
        expect(drafts.every((film) => !film.exists() && film.directorUrl === undefined)).toBe(true);
        expect(
            drafts.every((film) => film.director && !film.director.exists() && film.director.url === undefined),
        ).toBe(true);

        expect(saved).toHaveLength(2);
        for (const film of saved) {
            const fresh = await Film.findOrFail(film.url);

            expect(fresh.director?.name).toBe('Hayao Miyazaki');
            expect(fresh.director?.getDocumentUrl()).toBe(fresh.getDocumentUrl());
            expect(fresh.directorUrl).toBe(fresh.director?.url);
        }
        expect(saved[0]?.director?.url).not.toBe(saved[1]?.director?.url);
    });

    it('resets blank-node relations without explicit usingSameDocument()', async () => {
        // Arrange
        const Film = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Movie',
            fields: {
                title: z.string().rdfProperty('name'),
                directorUrl: z.url().rdfProperty('director').optional(),
            },
            relations: {
                director: belongsToOne('User', 'directorUrl'),
            },
        });

        bootModels({ Film });

        const jsonld = {
            '@context': {
                '@vocab': 'https://schema.org/',
                foaf: 'http://xmlns.com/foaf/0.1/',
            },
            '@type': 'Movie',
            name: 'Spirited Away',
            director: {
                '@type': 'foaf:Person',
                'foaf:name': 'Hayao Miyazaki',
            },
        };

        // Act
        const film = await Film.fromJsonLD(jsonld).newInstance();

        // Assert
        expect(film?.exists()).toBe(false);
        expect(film?.url).toBeUndefined();
        expect(film?.directorUrl).toBeUndefined();
        expect(film?.director?.exists()).toBe(false);
        expect(film?.director?.url).toBeUndefined();
        expect(film?.director?.name).toBe('Hayao Miyazaki');
    });

    it('skips soft-deleted resources when picking a default resource in newInstance()', async () => {
        // Arrange
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#deleted> a foaf:Person ; foaf:name "Deleted" .
            <#deleted-metadata>
                a crdt:Metadata ;
                crdt:resource <#deleted> ;
                crdt:deletedAt "2020-01-01T00:00:00.000Z"^^xsd:dateTime .

            <#active> a foaf:Person ; foaf:name "Active" .
        `;

        // Act
        const active = await User.fromTurtle(turtle, { baseIRI: 'https://source.example/users' }).newInstance();
        const deleted = await User.fromTurtle(turtle, { baseIRI: 'https://source.example/users' }).newInstance({
            includeSoftDeleted: true,
        });

        // Assert
        expect(active?.name).toBe('Active');
        expect(deleted?.name).toBe('Deleted');
        expect(deleted?.isSoftDeleted()).toBe(false);
    });

    it('resets blank-node relations on named-IRI parents without usingSameDocument()', async () => {
        // Arrange
        const Film = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Movie',
            fields: {
                title: z.string().rdfProperty('name'),
                directorUrl: z.url().rdfProperty('director').optional(),
            },
            relations: {
                director: belongsToOne('User', 'directorUrl'),
            },
        });

        bootModels({ Film });

        const jsonld = {
            '@context': {
                '@vocab': 'https://schema.org/',
                foaf: 'http://xmlns.com/foaf/0.1/',
            },
            '@id': 'https://source.example/movies/spirited-away',
            '@type': 'Movie',
            name: 'Spirited Away',
            director: {
                '@type': 'foaf:Person',
                'foaf:name': 'Hayao Miyazaki',
            },
        };

        // Act
        const film = await Film.fromJsonLD(jsonld).newInstance();

        // Assert
        expect(film?.exists()).toBe(false);
        expect(film?.url).toBeUndefined();
        expect(film?.directorUrl).toBeUndefined();
        expect(film?.director?.exists()).toBe(false);
        expect(film?.director?.url).toBeUndefined();
        expect(film?.director?.name).toBe('Hayao Miyazaki');
    });

    it('resets local members in mixed belongsToMany relations without usingSameDocument()', async () => {
        // Arrange
        const Team = defineSchema({
            rdfContext: 'http://xmlns.com/foaf/0.1/',
            rdfClass: 'Group',
            fields: {
                name: z.string(),
                memberUrls: z.array(z.url()).rdfProperty('member').default([]),
            },
            relations: {
                members: belongsToMany('User', 'memberUrls'),
            },
        });

        bootModels({ Team });

        const externalMemberUrl = 'https://external.example/profile#me';
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#group>
                a foaf:Group ;
                foaf:name "Straw Hats" ;
                foaf:member <#luffy>, <${externalMemberUrl}> .

            <#luffy>
                a foaf:Person ;
                foaf:name "Luffy" .
        `;

        // Act
        const team = await Team.fromTurtle(turtle, { baseIRI: 'https://source.example/group' }).newInstance();
        const teamWithoutBaseIRI = await Team.fromTurtle(turtle).newInstance();

        // Assert
        for (const instance of [team, teamWithoutBaseIRI]) {
            expect(instance?.exists()).toBe(false);
            expect(instance?.url).toBeUndefined();
            expect(instance?.memberUrls).toEqual([externalMemberUrl]);
        }
    });
});
