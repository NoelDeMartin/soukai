import { expandIRI, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import Movie from 'soukai-bis/testing/stubs/Movie';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import {
    createLocalDocument,
    createUnsyncedDocument,
    setupSyncTest,
    syncFixture,
    tombstoneTurtle,
} from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync local changes', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];
    let containerUrl: string;
    let documentUrl: string;

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());

        const storageUrl = config.userProfile.storageUrls[0];

        vi.setSystemTime(new Date('2022-01-01T00:00:00.000Z'));

        containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        documentUrl = fakeDocumentUrl({ containerUrl });
        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];
    });

    it('clears pushed local changes', async () => {
        // Arrange
        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.created());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            turtleToQuadsSync(syncFixture('movie.ttl', { documentUrl })),
        );

        // Act
        await syncMovies();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.objectContaining({ method: 'PATCH' }));
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toBeInstanceOf(Date);
    });

    it('pushes models created locally', async () => {
        // Arrange
        trackLocalChanges(Movie);

        const movie = await Movie.createAt(containerUrl, { title: 'Spirited Away' });
        const movieDocumentUrl = movie.requireDocumentUrl();

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.created());

        // Act
        await syncMovies();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            3,
            movieDocumentUrl,
            expect.objectContaining({ method: 'PATCH' }),
        );
        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a schema:Movie ;
                    schema:name "Spirited Away" .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
            }
        `);
        expect(await localEngine.getDocumentsLocalChanges()).toEqual({});
    });

    it('keeps the date of the merge when pushing to existing remote documents', async () => {
        // Arrange
        const mergedAt = new Date('2022-02-02T00:00:00.000Z');
        const remoteDocument = () =>
            FakeResponse.success(syncFixture('movie.ttl', { documentUrl }), {
                'Last-Modified': new Date('2021-06-01T00:00:00.000Z').toUTCString(),
            });

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, remoteDocument());
        FakeServer.respondOnce(documentUrl, remoteDocument());
        FakeServer.respondOnce(
            documentUrl,
            FakeResponse.success(undefined, { 'Last-Modified': mergedAt.toUTCString() }),
        );

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            turtleToQuadsSync(syncFixture('movie-watched.ttl', { documentUrl })),
        );

        // Act
        await syncMovies();

        // Assert
        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#action>
                    a schema:WatchAction ;
                    schema:object <#it> ;
                    schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#action-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#action> ;
                    crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
            }
        `);
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toEqual(mergedAt);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('keeps local changes saved during the sync', async () => {
        // Arrange
        trackLocalChanges(WatchAction);
        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:WatchAction')],
            }),
        ];

        const action = await WatchAction.createAt(containerUrl, { startTime: new Date() });
        const actionDocumentUrl = action.requireDocumentUrl();

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(actionDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnceWith(actionDocumentUrl, async () => {
            vi.advanceTimersByTime(1000);

            await action.update({ startTime: new Date() });

            return FakeResponse.created();
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: WatchAction, registration: true }],
        });

        // Assert
        const updateOperation = action.operations?.find((operation) => operation.date.getTime() === Date.now());

        expect(updateOperation).toBeDefined();
        expect(await localEngine.getDocumentLocalChanges(actionDocumentUrl)).toEqual({
            resources: { [action.url]: { newOperations: [updateOperation?.url] } },
        });
    });

    it('keeps local changes when pushes fail', async () => {
        // Arrange
        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.internalServerError());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            turtleToQuadsSync(syncFixture('movie.ttl', { documentUrl })),
        );

        // Act
        await syncMovies();

        // Assert
        const localChanges = await localEngine.getDocumentLocalChanges(documentUrl);

        expect(localChanges?.resources[`${documentUrl}#it`]).toEqual({ createdAt: expect.any(Date) });
    });

    it('pulls up to date documents with local changes', async () => {
        // Arrange
        const lastModifiedAt = new Date('2021-01-02T00:00:00.000Z');
        const remoteDocument = syncFixture('person-missing-second-name.ttl', { documentUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(
            containerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix purl: <http://purl.org/dc/terms/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <> a ldp:Container ; ldp:contains <${documentUrl}> .

                <${documentUrl}>
                    a ldp:Resource ;
                    purl:modified "${lastModifiedAt.toISOString()}"^^xsd:dateTime .
            `,
        );
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })), {
            lastModifiedAt,
            localChanges: () => ({
                resources: {
                    [`${documentUrl}#it`]: { newOperations: [`${documentUrl}#operation-2`] },
                },
            }),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('add-second-name.sparql'));
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('pushes local deletions as tombstones', async () => {
        // Arrange
        const remoteDocument = syncFixture('movie-watched.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie.ttl', { documentUrl }), {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('remove-watch-action.sparql'));
        expect(localDocument.contains(`${documentUrl}#action`)).toBe(false);
        expect(localDocument.statements(undefined, 'rdf:type', 'crdt:Tombstone')).toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('keeps empty documents after pushing tombstones', async () => {
        // Arrange
        const remoteDocument = syncFixture('watch-action.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, '', {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });
        const localContainer = await localEngine.readDocument(containerUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#action>
                    a schema:WatchAction, schema:Action ;
                    schema:object <#it> ;
                    schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#action-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#action> ;
                    crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
            } ;

            INSERT DATA { ${tombstoneTurtle('#action', '2022-01-01T00:00:00.000Z')} }
        `);
        expect(localDocument.getQuads()).toHaveLength(0);
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toBeInstanceOf(Date);
        expect(await localEngine.readDocumentIfExists(documentUrl)).toBeNull();
        expect(localContainer.contains(containerUrl, 'ldp:contains', documentUrl)).toBe(false);
    });

    it('removes empty documents missing remotely', async () => {
        // Arrange
        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());

        await createLocalDocument(localEngine, documentUrl, '', {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(await localEngine.readDocumentIfExists(documentUrl, { includeEmptyDocuments: true })).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('keeps local deletions when pushing tombstones fails', async () => {
        // Arrange
        const remoteDocument = syncFixture('movie-watched.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.internalServerError());

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie.ttl', { documentUrl }), {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(localDocument.contains(`${documentUrl}#action`)).toBe(false);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [`${documentUrl}#action`]: { deletedAt: expect.any(Date) } },
        });
    });

    it('pulls remote tombstones without copying them', async () => {
        // Arrange
        const remoteDocument = [
            syncFixture('movie.ttl', { documentUrl }),
            tombstoneTurtle(`${documentUrl}#action`, '2022-01-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }));

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(localDocument.contains(`${documentUrl}#it`)).toBe(true);
        expect(localDocument.contains(`${documentUrl}#action`)).toBe(false);
        expect(localDocument.statements(undefined, 'rdf:type', 'crdt:Tombstone')).toHaveLength(0);
    });

    it('strips tombstones from documents pulled for the first time', async () => {
        // Arrange
        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            FakeResponse.success(tombstoneTurtle(`${documentUrl}#action`, '2022-01-01T00:00:00.000Z'), {
                'Last-Modified': new Date().toUTCString(),
            }),
        );

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(localDocument.getQuads()).toHaveLength(0);
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toBeInstanceOf(Date);
        expect(await localEngine.readDocumentIfExists(documentUrl)).toBeNull();
    });

    it('drops pending deletions when re-creating missing remote documents', async () => {
        // Arrange
        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.created());

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie.ttl', { documentUrl }), {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(
            `INSERT DATA { ${syncFixture('movie.ttl')} }`,
        );
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('records deletions of models deleted while their creation is pushed', async () => {
        // Arrange
        trackLocalChanges(Movie);
        trackLocalChanges(WatchAction);

        const movie = await Movie.createAt(containerUrl, { title: 'Spirited Away' });
        const action = await movie.relatedAction.create({ startTime: new Date() });
        const movieDocumentUrl = movie.requireDocumentUrl();

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnceWith(movieDocumentUrl, async () => {
            await action.delete();

            return FakeResponse.created();
        });

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(movieDocumentUrl);

        expect(localDocument.contains(movie.url)).toBe(true);
        expect(localDocument.contains(action.requireUrl())).toBe(false);
        expect(await localEngine.getDocumentLocalChanges(movieDocumentUrl)).toEqual({
            resources: { [action.requireUrl()]: { deletedAt: expect.any(Date) } },
        });
    });

    it('records deleted operations of models deleted while their creation is pushed', async () => {
        // Arrange
        trackLocalChanges(Movie);
        trackLocalChanges(WatchAction);

        const movie = await Movie.createAt(containerUrl, { title: 'Spirited Away' });
        const action = await movie.relatedAction.create({ startTime: new Date('2021-01-01T00:00:00.000Z') });
        const movieDocumentUrl = movie.requireDocumentUrl();

        await action.update({ startTime: new Date('2021-06-01T00:00:00.000Z') });

        const operationUrls = (action.operations ?? []).map((operation) => operation.url);

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnceWith(movieDocumentUrl, async () => {
            await action.delete();

            return FakeResponse.created();
        });

        // Act
        await syncMovies();

        // Assert
        const localChanges = await localEngine.getDocumentLocalChanges(movieDocumentUrl);

        expect(operationUrls.length).toBeGreaterThan(1);
        expect(localChanges?.resources[action.requireUrl()]).toEqual({
            deletedAt: expect.any(Date),
            deletedOperations: expect.arrayContaining(operationUrls),
        });
        expect(localChanges?.resources[action.requireUrl()]).toHaveProperty(
            'deletedOperations.length',
            operationUrls.length,
        );
    });

    it('records deletions of documents deleted while their creation is pushed', async () => {
        // Arrange
        trackLocalChanges(WatchAction);
        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:WatchAction')],
            }),
        ];

        const action = await WatchAction.createAt(containerUrl, { startTime: new Date() });
        const actionDocumentUrl = action.requireDocumentUrl();

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(actionDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnceWith(actionDocumentUrl, async () => {
            await action.delete();

            return FakeResponse.created();
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: WatchAction, registration: true }],
        });

        // Assert
        const localDocument = await localEngine.readDocument(actionDocumentUrl, { includeEmptyDocuments: true });

        expect(localDocument.getQuads()).toHaveLength(0);
        expect((await localEngine.getDocumentsLastModifiedAt())[actionDocumentUrl]).toBeInstanceOf(Date);
        expect(await localEngine.getDocumentLocalChanges(actionDocumentUrl)).toEqual({
            resources: { [action.url]: { deletedAt: expect.any(Date) } },
        });
    });

    it('keeps models saved into empty documents missing remotely', async () => {
        // Arrange
        trackLocalChanges(WatchAction);

        const actionUrl = `${documentUrl}#new-action`;

        FakeServer.respondOnce(containerUrl, containerTurtle([]));
        FakeServer.respondOnceWith(documentUrl, async () => {
            await WatchAction.create({ url: actionUrl, startTime: new Date() });

            return FakeResponse.notFound();
        });

        await createLocalDocument(localEngine, documentUrl, '', {
            [`${documentUrl}#action`]: { deletedAt: new Date() },
        });

        // Act
        await syncMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(localDocument.contains(actionUrl)).toBe(true);
        expect((await localEngine.getDocumentLocalChanges(documentUrl))?.resources[actionUrl]).toEqual({
            createdAt: expect.any(Date),
        });
    });

    async function syncMovies(): Promise<void> {
        await Sync.run({
            ...config,
            applicationModels: [
                { model: Movie, registration: true },
                { model: WatchAction, registration: false },
            ],
        });
    }
});
