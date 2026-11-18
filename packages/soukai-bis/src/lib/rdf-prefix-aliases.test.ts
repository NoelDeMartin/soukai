import { quadsToTurtle, turtleToQuads } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireEngine, setEngine } from 'soukai-bis/engines/state';
import Sync from 'soukai-bis/jobs/sync/Sync';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import { getRDFIRIVariants } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { setRDFPrefixAliases } from 'soukai-bis/lib/rdf-prefix-aliases';
import { isPropertyOperation } from 'soukai-bis/models/crdts/helpers';
import { TypeIndex } from 'soukai-bis/models/interop';
import { bootModels, replaceRDFPrefixes } from 'soukai-bis/models/registry';
import { remote } from 'soukai-bis/models/remote';
import { defineSchema } from 'soukai-bis/models/schema';
import { hydrateModel } from 'soukai-bis/models/serialization';
import { HTTP_SCHEMA, ICAL, SCHEMA as HTTPS_SCHEMA } from 'soukai-bis/testing/constants';
import Movie from 'soukai-bis/testing/stubs/Movie';
import MovieWithHistory from 'soukai-bis/testing/stubs/MovieWithHistory';
import PlaylistSchema from 'soukai-bis/testing/stubs/Playlist.schema';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { string } from 'zod';

describe('RDF prefix aliases', () => {
    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = requireEngine() as InMemoryEngine;

        setRDFPrefixAliases({ [HTTPS_SCHEMA]: HTTP_SCHEMA });
    });

    describe('reads', () => {
        it('reads resources using alias classes and properties via find, all, and createManyFromRDF', async () => {
            const containerUrl = 'https://alice.example.org/movies/';
            const docUrl = `${containerUrl}movie-1`;
            const resourceUrl = `${docUrl}#it`;
            const turtle = `
                @prefix schema: <${HTTP_SCHEMA}> .

                <${resourceUrl}>
                    a schema:Movie ;
                    schema:name "Spirited Away" .
            `;

            await engine.createDocument(
                containerUrl,
                await turtleToQuads(`
                    <${containerUrl}> <http://www.w3.org/ns/ldp#contains> <${docUrl}> .
                `),
            );
            await engine.createDocument(docUrl, await turtleToQuads(turtle));

            const found = await Movie.findOrFail(resourceUrl);
            const all = await Movie.all({ $in: [docUrl] });
            const fromRDF = await Movie.createManyFromRDF(await turtleToQuads(turtle));

            expect(found.title).toBe('Spirited Away');
            expect(all).toHaveLength(1);
            expect(all[0]?.title).toBe('Spirited Away');
            expect(fromRDF).toHaveLength(1);
            expect(fromRDF[0]?.title).toBe('Spirited Away');
        });

        it('matches resources mixing prefixes and prefers the main property', async () => {
            const docUrl = 'https://alice.example.org/tasks/mixed';
            const resourceUrl = `${docUrl}#it`;
            const projectUrl = 'https://alice.example.org/projects/solid#it';

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    <${resourceUrl}>
                        a <${HTTP_SCHEMA}Action> ;
                        <${HTTPS_SCHEMA}name> "Main name" ;
                        <${HTTP_SCHEMA}name> "Alias name" ;
                        <${HTTP_SCHEMA}object> <${projectUrl}> .
                `),
            );

            const task = await Task.findOrFail(resourceUrl);

            expect(task.name).toBe('Main name');
            expect(task.projectUrl).toBe(projectUrl);
        });

        it('finds type index registrations with aliased forClass', async () => {
            const typeIndexUrl = 'https://alice.example.org/settings/privateTypeIndex.ttl';
            const containerUrl = 'https://alice.example.org/movies/';

            FakeServer.respondOnce(
                typeIndexUrl,
                FakeResponse.success(`
                    @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <> a solid:TypeIndex .

                    <#reg>
                        a solid:TypeRegistration ;
                        solid:forClass schema:Movie ;
                        solid:instanceContainer <${containerUrl}> .
                `),
            );

            const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);
            const containerUrls = await typeIndex.findContainerUrls(Movie);

            expect(containerUrls).toEqual([containerUrl]);
        });

        it('syncs aliased resources between remote and local engines', async () => {
            const containerUrl = 'https://alice.example.org/movies/';
            const docUrl = `${containerUrl}movie-1`;
            const resourceUrl = `${docUrl}#it`;
            const typeIndexUrl = 'https://alice.example.org/settings/privateTypeIndex.ttl';

            FakeServer.respondOnce(
                typeIndexUrl,
                FakeResponse.success(`
                    @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <> a solid:TypeIndex .

                    <#reg>
                        a solid:TypeRegistration ;
                        solid:forClass schema:Movie ;
                        solid:instanceContainer <${containerUrl}> .
                `),
            );
            FakeServer.respondOnce(
                containerUrl,
                FakeResponse.success(`
                    <${containerUrl}>
                        a <http://www.w3.org/ns/ldp#Container> ;
                        <http://www.w3.org/ns/ldp#contains> <${docUrl}> .
                `),
            );
            FakeServer.respondOnce(
                docUrl,
                FakeResponse.success(`
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <${resourceUrl}>
                        a schema:Movie ;
                        schema:name "Remote aliased movie" .
                `),
            );

            await Sync.run({
                userProfile: {
                    webId: 'https://alice.example.org/profile/card#me',
                    storageUrls: ['https://alice.example.org/'],
                    shallow: false,
                    cloakedDocumentUrls: [],
                    publicTypeIndexUrls: [],
                    privateTypeIndexUrls: [typeIndexUrl],
                    writableProfileUrl: 'https://alice.example.org/profile/card',
                } satisfies CompleteSolidUserProfile,
                applicationModels: [{ model: MovieWithHistory, registration: { path: 'movies' } }],
                privateTypeIndexes: [await TypeIndex.findOrFail(typeIndexUrl)],
                publicTypeIndexes: [],
            });

            const localMovie = await MovieWithHistory.findOrFail(resourceUrl);

            expect(localMovie.title).toBe('Remote aliased movie');
            expect(localMovie.usesRDFPrefixAliases()).toBe(true);
        });
    });

    describe('writes', () => {
        it('writes the main property and removes alias triples in InMemoryEngine', async () => {
            const docUrl = 'https://alice.example.org/tasks/task-1';
            const resourceUrl = `${docUrl}#it`;
            const projectUrl = 'https://alice.example.org/projects/solid#it';

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <${resourceUrl}>
                        a schema:Action ;
                        schema:name "Old name" ;
                        schema:object <${projectUrl}> .
                `),
            );

            const task = await Task.findOrFail(resourceUrl);

            task.name = 'New name';
            task.projectUrl = undefined;
            await task.save();

            const updated = await engine.readDocument(docUrl);
            const resourceQuads = updated.getQuads().filter((quad) => quad.subject.value === resourceUrl);

            expect(quadsToTurtle(resourceQuads)).toEqualTurtle(`
                <${resourceUrl}>
                    a <${HTTP_SCHEMA}Action> ;
                    <${HTTPS_SCHEMA}name> "New name" .
            `);
        });

        it('deletes alias variants in SPARQL updates for SolidEngine', async () => {
            const docUrl = 'https://alice.example.org/tasks/task-1';
            const resourceUrl = `${docUrl}#it`;
            const projectUrl = 'https://alice.example.org/projects/solid#it';
            const turtle = `
                @prefix schema: <${HTTP_SCHEMA}> .

                <${resourceUrl}>
                    a schema:Action ;
                    schema:name "Old name" ;
                    schema:object <${projectUrl}> .
            `;

            setEngine(new SolidEngine({ fetch: FakeServer.fetch }));

            FakeServer.respondOnce(docUrl, FakeResponse.success(turtle));
            FakeServer.respondOnce(docUrl, FakeResponse.success(turtle));
            FakeServer.respondOnce(docUrl, FakeResponse.success());

            const task = await Task.findOrFail(resourceUrl);

            task.name = 'New name';
            task.projectUrl = undefined;
            await task.save();

            const sparql = String(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body);

            expect(sparql).toContain(`DELETE DATA`);
            expect(sparql).toContain(`<${HTTP_SCHEMA}name> "Old name"`);
            expect(sparql).toContain(`<${HTTP_SCHEMA}object> <${projectUrl}>`);
            expect(sparql).toContain(`<${HTTPS_SCHEMA}name> "New name"`);
        });
    });

    describe('usesRDFPrefixAliases()', () => {
        it('returns false for new models and models with only main IRIs', async () => {
            const newMovie = new Movie({ title: 'New' });

            expect(newMovie.usesRDFPrefixAliases()).toBe(false);

            const docUrl = 'https://alice.example.org/movies/main';
            const resourceUrl = `${docUrl}#it`;

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix schema: <${HTTPS_SCHEMA}> .

                    <${resourceUrl}>
                        a schema:Movie ;
                        schema:name "Main" .
                `),
            );

            const withAliases = await Movie.findOrFail(resourceUrl);
            expect(withAliases.usesRDFPrefixAliases()).toBe(false);

            setRDFPrefixAliases({});
            const withoutAliases = await Movie.findOrFail(resourceUrl);
            expect(withoutAliases.usesRDFPrefixAliases()).toBe(false);
        });

        it('tracks alias classes, alias properties, mixed properties, updates, and serialization', async () => {
            // Alias property only (main class) -> becomes false after updating that property
            const propDocUrl = 'https://alice.example.org/movies/prop-only';
            const propResourceUrl = `${propDocUrl}#it`;

            await engine.createDocument(
                propDocUrl,
                await turtleToQuads(`
                    <${propResourceUrl}>
                        a <${HTTPS_SCHEMA}Movie> ;
                        <${HTTP_SCHEMA}name> "Alias prop" .
                `),
            );

            const propMovie = await Movie.findOrFail(propResourceUrl);
            expect(propMovie.usesRDFPrefixAliases()).toBe(true);

            // Survives serialization/deserialization
            const hydrated = await hydrateModel(propMovie.serialize());
            expect(hydrated.usesRDFPrefixAliases()).toBe(true);

            await propMovie.update({ title: 'Updated prop' });
            expect(propMovie.usesRDFPrefixAliases()).toBe(false);

            // Alias class -> stays true after updating properties
            const classDocUrl = 'https://alice.example.org/movies/class-alias';
            const classResourceUrl = `${classDocUrl}#it`;

            await engine.createDocument(
                classDocUrl,
                await turtleToQuads(`
                    <${classResourceUrl}>
                        a <${HTTP_SCHEMA}Movie> ;
                        <${HTTP_SCHEMA}name> "Alias class & prop" .
                `),
            );

            const classMovie = await Movie.findOrFail(classResourceUrl);
            expect(classMovie.usesRDFPrefixAliases()).toBe(true);

            await classMovie.update({ title: 'Updated' });
            expect(classMovie.usesRDFPrefixAliases()).toBe(true);

            // Mixed property (main + alias) -> true
            const mixedDocUrl = 'https://alice.example.org/movies/mixed-prop';
            const mixedResourceUrl = `${mixedDocUrl}#it`;

            await engine.createDocument(
                mixedDocUrl,
                await turtleToQuads(`
                    <${mixedResourceUrl}>
                        a <${HTTPS_SCHEMA}Movie> ;
                        <${HTTPS_SCHEMA}name> "Main" ;
                        <${HTTP_SCHEMA}name> "Alias" .
                `),
            );

            const mixedMovie = await Movie.findOrFail(mixedResourceUrl);
            expect(mixedMovie.usesRDFPrefixAliases()).toBe(true);
        });
    });

    describe('history', () => {
        it('replays http and https operations as the same property', async () => {
            const docUrl = 'https://alice.example.org/movies/history';
            const resourceUrl = `${docUrl}#it`;

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <${resourceUrl}>
                        a <${HTTP_SCHEMA}Movie> ;
                        <${HTTP_SCHEMA}name> "First" .

                    <${docUrl}#op-1>
                        a crdt:SetPropertyOperation ;
                        crdt:resource <${resourceUrl}> ;
                        crdt:property <${HTTP_SCHEMA}name> ;
                        crdt:value "First" ;
                        crdt:date "2025-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <${docUrl}#op-2>
                        a crdt:SetPropertyOperation ;
                        crdt:resource <${resourceUrl}> ;
                        crdt:property <${HTTPS_SCHEMA}name> ;
                        crdt:value "Second" ;
                        crdt:date "2025-01-02T00:00:00.000Z"^^xsd:dateTime .
                `),
            );

            const movie = await MovieWithHistory.findOrFail(resourceUrl);

            await movie.syncOperations();

            expect(movie.title).toBe('Second');
        });

        it('rewrites aliased properties when creating inception operations', async () => {
            class TaskWithHistory extends defineSchema(Task, { history: true, timestamps: false }) {}

            bootModels({ TaskWithHistory }, { reset: true });

            const docUrl = 'https://alice.example.org/tasks/inception';
            const resourceUrl = `${docUrl}#it`;
            const projectUrl = 'https://alice.example.org/projects/solid#it';

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <${resourceUrl}>
                        a <${HTTPS_SCHEMA}Action> ;
                        schema:name "Old name" ;
                        schema:object <${projectUrl}> .
                `),
            );

            const task = await TaskWithHistory.findOrFail(resourceUrl);

            expect(task.usesRDFPrefixAliases()).toBe(true);

            await task.update({ name: 'New name' });

            const document = await engine.readDocument(docUrl);
            const resourceQuads = document.getQuads().filter((quad) => quad.subject.value === resourceUrl);

            expect(task.usesRDFPrefixAliases()).toBe(false);
            expect(quadsToTurtle(resourceQuads)).toEqualTurtle(`
                <${resourceUrl}>
                    a <${HTTPS_SCHEMA}Action> ;
                    <${HTTPS_SCHEMA}name> "New name" ;
                    <${HTTPS_SCHEMA}object> <${projectUrl}> .
            `);
            expect(
                task.operations
                    ?.filter(isPropertyOperation)
                    .filter((operation) => operation.property !== RDF_TYPE)
                    .map((operation) => operation.property)
                    .sort(),
            ).toEqual([`${HTTPS_SCHEMA}name`, `${HTTPS_SCHEMA}name`, `${HTTPS_SCHEMA}object`]);
        });

        it('rewrites aliased array properties instead of adding or removing items', async () => {
            class PlaylistWithHistory extends defineSchema(PlaylistSchema, { history: true, timestamps: false }) {}

            bootModels({ PlaylistWithHistory }, { reset: true });

            const docUrl = 'https://alice.example.org/playlists/aliased';
            const resourceUrl = `${docUrl}#it`;

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <${resourceUrl}>
                        a <${HTTPS_SCHEMA}MusicPlaylist> ;
                        schema:name "Favorites" ;
                        schema:track <https://example.org/songs/1> .
                `),
            );

            const playlist = await PlaylistWithHistory.findOrFail(resourceUrl);

            await playlist.update({ songUrls: ['https://example.org/songs/1', 'https://example.org/songs/2'] });

            const document = await engine.readDocument(docUrl);
            const resourceQuads = document.getQuads().filter((quad) => quad.subject.value === resourceUrl);

            expect(playlist.usesRDFPrefixAliases()).toBe(false);
            expect(quadsToTurtle(resourceQuads)).toEqualTurtle(`
                <${resourceUrl}>
                    a <${HTTPS_SCHEMA}MusicPlaylist> ;
                    <${HTTPS_SCHEMA}name> "Favorites" ;
                    <${HTTPS_SCHEMA}track> <https://example.org/songs/1>, <https://example.org/songs/2> .
            `);
        });
    });

    describe('migrateSchema', () => {
        it('does not keep aliased triples as unknown data', async () => {
            const docUrl = 'https://alice.example.org/tasks/migrate';
            const resourceUrl = `${docUrl}#it`;

            await engine.createDocument(
                docUrl,
                await turtleToQuads(`
                    @prefix schema: <${HTTP_SCHEMA}> .

                    <${resourceUrl}>
                        a schema:Action ;
                        schema:name "Task name" .
                `),
            );

            const task = await Task.findOrFail(resourceUrl);

            await task.migrateSchema(TaskICalSchema);

            const migrated = await engine.readDocument(docUrl);
            const resourceQuads = migrated.getQuads().filter((quad) => quad.subject.value === `${docUrl}#task`);

            expect(quadsToTurtle(resourceQuads)).toEqualTurtle(`
                @prefix ical: <${ICAL}> .

                <${docUrl}#task>
                    a ical:Vtodo ;
                    ical:summary "Task name" .
            `);
        });
    });

    describe('replaceRDFPrefixes', () => {
        it('rewrites booted models, implicit classes, and remote() variants, and is reversible', async () => {
            class ReplacedTask extends defineSchema({
                rdfContext: HTTPS_SCHEMA,
                rdfClass: 'Action',
                timestamps: false,
                fields: { name: string() },
            }) {}

            class ImplicitTask extends defineSchema({
                rdfContext: HTTPS_SCHEMA,
                timestamps: false,
                fields: { name: string() },
            }) {}

            bootModels({ ReplacedTask, ImplicitTask }, { reset: true });

            const RemoteTask = remote(ReplacedTask);

            replaceRDFPrefixes({ [HTTPS_SCHEMA]: HTTP_SCHEMA });

            const httpTask = await ReplacedTask.create({ name: 'Http task' });
            const httpImplicit = await ImplicitTask.create({ name: 'Http implicit' });

            expect(RemoteTask.getRDFClasses()).toEqual([`${HTTP_SCHEMA}Action`]);
            expect(quadsToTurtle((await engine.readDocument(httpTask.requireDocumentUrl())).getQuads())).toEqualTurtle(`
                <${httpTask.url}>
                    a <${HTTP_SCHEMA}Action> ;
                    <${HTTP_SCHEMA}name> "Http task" .
            `);
            expect(quadsToTurtle((await engine.readDocument(httpImplicit.requireDocumentUrl())).getQuads()))
                .toEqualTurtle(`
                <${httpImplicit.url}>
                    a <${HTTP_SCHEMA}ImplicitTask> ;
                    <${HTTP_SCHEMA}name> "Http implicit" .
            `);

            replaceRDFPrefixes({ [HTTP_SCHEMA]: HTTPS_SCHEMA });

            const httpsTask = await ReplacedTask.create({ name: 'Https task' });

            expect(RemoteTask.getRDFClasses()).toEqual([`${HTTPS_SCHEMA}Action`]);
            expect(quadsToTurtle((await engine.readDocument(httpsTask.requireDocumentUrl())).getQuads()))
                .toEqualTurtle(`
                <${httpsTask.url}>
                    a <${HTTPS_SCHEMA}Action> ;
                    <${HTTPS_SCHEMA}name> "Https task" .
            `);
        });

        it('replaces previous aliases when calling setRDFPrefixAliases() again', () => {
            expect(getRDFIRIVariants(`${HTTPS_SCHEMA}name`)).toEqual([`${HTTPS_SCHEMA}name`, `${HTTP_SCHEMA}name`]);

            setRDFPrefixAliases({ 'https://example.org/': 'http://example.org/' });

            expect(getRDFIRIVariants(`${HTTPS_SCHEMA}name`)).toEqual([`${HTTPS_SCHEMA}name`]);
            expect(getRDFIRIVariants('https://example.org/foo')).toEqual([
                'https://example.org/foo',
                'http://example.org/foo',
            ]);
        });
    });
});
