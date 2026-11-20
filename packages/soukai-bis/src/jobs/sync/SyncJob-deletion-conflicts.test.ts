import { expandIRI } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { bootModels } from 'soukai-bis/models/registry';
import { belongsToMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Rating from 'soukai-bis/testing/stubs/Rating';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { array, url } from 'zod';

import SyncJob from './SyncJob';
import type { DeletionConflict, SyncJobConfig } from './SyncJob';
import { createLocalDocument, setupSyncTest, syncFixture, tombstoneTurtle } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';
import CascadingMovie from './testing/stubs/CascadingMovie';
import Franchise from './testing/stubs/Franchise';
import RatedMovie from './testing/stubs/RatedMovie';

describe('SyncJob deletion conflicts', () => {
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

    it('deletes local changes on resources deleted remotely', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async (_: DeletionConflict) => 'delete' as const);

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-remotely', resourceUrl: movieUrl() }),
        );
        expect(resolveDeletionConflict.mock.calls[0]?.[0].model?.url).toEqual(movieUrl());
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(localDocument.getQuads()).toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('resolves deletion conflicts without models when they fail to load', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async (_: DeletionConflict) => 'delete' as const);

        vi.spyOn(CascadingMovie, 'createFromDocument').mockRejectedValue(new Error('Invalid data'));

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).toHaveBeenCalledWith(expect.objectContaining({ model: null }));
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('restores resources deleted remotely', async () => {
        // Arrange
        const tombstone = tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(tombstone, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(tombstone, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await syncCascadingMovies(async () => 'restore');

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            DELETE DATA { ${tombstoneTurtle('#it', '2021-06-01T00:00:00.000Z')} } ;
            INSERT DATA { ${syncFixture('movie-watched.ttl')} }
        `);
        expect(localDocument.contains(movieUrl())).toBe(true);
        expect(localDocument.contains(actionUrl())).toBe(true);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('deletes resources deleted remotely without local changes', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {});

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(resolveDeletionConflict).not.toHaveBeenCalled();
        expect(localDocument.getQuads()).toHaveLength(0);
    });

    it('asks about resources deleted locally when dependants were added remotely', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'delete' as const);
        const remoteContents = syncFixture('movie-watched.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, '', { [movieUrl()]: { deletedAt: new Date() } });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-locally', resourceUrl: movieUrl() }),
        );
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            DELETE DATA { ${syncFixture('movie-watched.ttl')} } ;
            INSERT DATA {
                ${tombstoneTurtle('#it', '2022-01-01T00:00:00.000Z')}
                ${tombstoneTurtle('#action', '2022-01-01T00:00:00.000Z')}
            }
        `);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('asks about resources deleted locally with unseen remote operations', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async (_: DeletionConflict) => 'delete' as const);
        const remoteContents = [
            syncFixture('movie.ttl', { documentUrl }),
            operationTurtle(movieUrl(), 'Original', '2021-01-01T00:00:00.000Z'),
            operationTurtle(movieUrl(), 'Updated', '2021-06-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, '', {
            [movieUrl()]: { deletedAt: new Date(), deletedOperations: [`${movieUrl()}-operation-Original`] },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-locally', resourceUrl: movieUrl() }),
        );
        expect(resolveDeletionConflict.mock.calls[0]?.[0].model?.url).toEqual(movieUrl());
    });

    it('deletes resources deleted locally without unseen remote operations', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
        const remoteContents = [
            syncFixture('movie.ttl', { documentUrl }),
            operationTurtle(movieUrl(), 'Original', '2021-01-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, '', {
            [movieUrl()]: { deletedAt: new Date(), deletedOperations: [`${movieUrl()}-operation-Original`] },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).not.toHaveBeenCalled();
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('deletes resources deleted locally when other resources changed remotely', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
        const commentTurtle = (text: string) => `
            <${documentUrl}#comment> a <https://schema.org/Comment> ; <https://schema.org/text> "${text}" .
        `;
        const remoteContents = [syncFixture('movie.ttl', { documentUrl }), commentTurtle('Updated')].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, commentTurtle('Original'), {
            [movieUrl()]: { deletedAt: new Date() },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).not.toHaveBeenCalled();
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('restores resources deleted locally', async () => {
        // Arrange
        const remoteContents = [
            syncFixture('movie-watched.ttl', { documentUrl }),
            operationTurtle(movieUrl(), 'Updated', '2021-06-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));

        await createLocalDocument(localEngine, documentUrl, '', {
            [movieUrl()]: { deletedAt: new Date() },
            [actionUrl()]: { deletedAt: new Date() },
        });

        // Act
        await syncCascadingMovies(async () => 'restore');

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(localDocument.contains(movieUrl())).toBe(true);
        expect(localDocument.contains(actionUrl())).toBe(true);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('deletes resources deleted locally without remote changes', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
        const remoteContents = syncFixture('movie-watched.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-01-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-01-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, '', {
            [movieUrl()]: { deletedAt: new Date() },
            [actionUrl()]: { deletedAt: new Date() },
        });

        // Act
        await syncCascadingMovies(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).not.toHaveBeenCalled();
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('restores deletions across documents', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
        const franchiseTombstone = tombstoneTurtle(franchiseUrl(), '2021-06-01T00:00:00.000Z');
        const movieTombstone = tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z');

        FakeServer.respondOnce(containerUrl, containerTurtle([franchiseDocumentUrl(), documentUrl]));
        FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTombstone, '2021-06-01'));
        FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTombstone, '2021-06-01'));
        FakeServer.respondOnce(franchiseDocumentUrl(), FakeResponse.success());
        FakeServer.respondOnce(documentUrl, remoteDocument(movieTombstone, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(movieTombstone, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, franchiseDocumentUrl(), franchiseTurtle(), {});
        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await syncFranchises(resolveDeletionConflict);

        // Assert
        const patches = FakeServer.fetchSpy.mock.calls.filter(([, init]) => init?.method === 'PATCH');
        const franchiseDocument = await localEngine.readDocument(franchiseDocumentUrl());
        const movieDocument = await localEngine.readDocument(documentUrl);

        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-remotely', resourceUrl: franchiseUrl() }),
        );
        expect(patches).toHaveLength(2);
        expect(patches.every(([, init]) => String(init?.body).includes('-tombstone>'))).toBe(true);
        expect(franchiseDocument.contains(franchiseUrl())).toBe(true);
        expect(movieDocument.contains(movieUrl())).toBe(true);
        expect(movieDocument.contains(actionUrl())).toBe(true);
    });

    it('deletes across documents', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'delete' as const);
        const franchiseTombstone = tombstoneTurtle(franchiseUrl(), '2021-06-01T00:00:00.000Z');
        const movieTombstone = tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z');

        FakeServer.respondOnce(containerUrl, containerTurtle([franchiseDocumentUrl(), documentUrl]));
        FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTombstone, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(movieTombstone, '2021-06-01'));

        await createLocalDocument(localEngine, franchiseDocumentUrl(), franchiseTurtle(), {});
        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await syncFranchises(resolveDeletionConflict);

        // Assert
        const franchiseDocument = await localEngine.readDocument(franchiseDocumentUrl(), {
            includeEmptyDocuments: true,
        });
        const movieDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-remotely', resourceUrl: franchiseUrl() }),
        );
        expect(franchiseDocument.getQuads()).toHaveLength(0);
        expect(movieDocument.getQuads()).toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('asks about local deletions across documents', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'delete' as const);
        const remoteMovie = syncFixture('movie-watched.ttl', { documentUrl });

        FakeServer.respondOnce(containerUrl, containerTurtle([franchiseDocumentUrl(), documentUrl]));
        FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTurtle(), '2021-01-01'));
        FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTurtle(), '2021-01-01'));
        FakeServer.respondOnce(franchiseDocumentUrl(), FakeResponse.success());
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteMovie, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteMovie, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, franchiseDocumentUrl(), '', {
            [franchiseUrl()]: { deletedAt: new Date() },
        });
        await createLocalDocument(localEngine, documentUrl, '', { [movieUrl()]: { deletedAt: new Date() } });

        // Act
        await syncFranchises(resolveDeletionConflict);

        // Assert
        expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
        expect(resolveDeletionConflict).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'deleted-locally', resourceUrl: franchiseUrl() }),
        );
        expect(await localEngine.getDocumentLocalChanges(franchiseDocumentUrl())).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('links children restored on the POD', async () => {
        // Arrange
        const remoteContents = [
            movieTurtle({ rated: false }),
            tombstoneTurtle(ratingUrl(), '2021-06-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, [movieTurtle({ rated: true }), ratingTurtle()].join('\n'), {
            [ratingUrl()]: { updatedAt: new Date() },
        });

        // Act
        await syncRatedMovies();

        // Assert
        const body = FakeServer.fetchSpy.mock.calls[3]?.[1]?.body as string;

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        const [deletions, insertions] = body.split('INSERT DATA');

        expect(deletions).toContain('<#rating-tombstone>');
        expect(insertions).toContain('<https://vocab.noeldemartin.com/crdt/SetPropertyOperation>');
        expect(insertions).toContain(
            '<https://vocab.noeldemartin.com/crdt/property> <https://schema.org/aggregateRating>',
        );
        expect(insertions).toContain('<#it> <https://schema.org/aggregateRating> <#rating>');
        expect(insertions).toContain('<#rating> <https://schema.org/ratingValue>');
    });

    it('links children restored locally', async () => {
        // Arrange
        const remoteContents = [
            movieTurtle({ rated: true }),
            ratingTurtle(),
            operationTurtle(ratingUrl(), 'Updated', '2021-06-01T00:00:00.000Z'),
        ].join('\n');

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, movieTurtle({ rated: false }), {
            [ratingUrl()]: { deletedAt: new Date() },
        });

        // Act
        await syncRatedMovies();

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(localDocument.contains(ratingUrl())).toBe(true);
        expect(localDocument.contains(movieUrl(), 'schema:aggregateRating', ratingUrl())).toBe(true);
        expect(localDocument.statements(undefined, 'rdf:type', 'crdt:SetPropertyOperation')).not.toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('links children restored in array fields without overwriting other changes', async () => {
        // Arrange
        class MultiRatedMovie extends defineSchema(Movie, {
            history: true,
            fields: { ratingUrls: array(url()).rdfProperty('aggregateRating').optional() },
            relations: {
                ratings: belongsToMany('Rating', 'ratingUrls').usingSameDocument().onDelete('cascade'),
            },
        }) {}

        const otherRatingUrl = `${documentUrl}#other-rating`;
        const remoteContents = [
            movieTurtle({ rated: false }),
            `<${movieUrl()}> <https://schema.org/aggregateRating> <${otherRatingUrl}> .`,
            `<${otherRatingUrl}> a <https://schema.org/Rating> ; <https://schema.org/ratingValue> 5 .`,
            `
                <${movieUrl()}-operation-remove>
                    a crdt:RemovePropertyOperation ;
                    crdt:resource <${movieUrl()}> ;
                    crdt:property schema:aggregateRating ;
                    crdt:value <${ratingUrl()}> ;
                    crdt:date "2021-06-01T00:00:00.000Z"^^xsd:dateTime .

                <${movieUrl()}-operation-add>
                    a crdt:AddPropertyOperation ;
                    crdt:resource <${movieUrl()}> ;
                    crdt:property schema:aggregateRating ;
                    crdt:value <${otherRatingUrl}> ;
                    crdt:date "2021-06-01T00:00:00.000Z"^^xsd:dateTime .
            `,
            tombstoneTurtle(ratingUrl(), '2021-06-01T00:00:00.000Z'),
        ].join('\n');

        bootModels({ MultiRatedMovie });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createLocalDocument(localEngine, documentUrl, [movieTurtle({ rated: true }), ratingTurtle()].join('\n'), {
            [ratingUrl()]: { updatedAt: new Date() },
        });

        // Act
        await SyncJob.run({
            ...config,
            applicationModels: [
                { model: MultiRatedMovie, registration: true },
                { model: Rating, registration: false },
            ],
            resolveDeletionConflict: async () => 'restore',
        });

        // Assert
        const body = FakeServer.fetchSpy.mock.calls[3]?.[1]?.body as string;
        const [deletions, insertions] = body.split('INSERT DATA');
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(deletions).not.toContain('<https://schema.org/aggregateRating>');
        expect(insertions).toContain('<https://vocab.noeldemartin.com/crdt/AddPropertyOperation>');
        expect(insertions).toContain('<#it> <https://schema.org/aggregateRating> <#rating>');
        expect(localDocument.contains(movieUrl(), 'schema:aggregateRating', ratingUrl())).toBe(true);
        expect(localDocument.contains(movieUrl(), 'schema:aggregateRating', otherRatingUrl)).toBe(true);
    });

    it('reads documents with deletions again after pulling', async () => {
        // Arrange
        const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
        const otherDocumentUrl = `${containerUrl}other`;

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl, otherDocumentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );
        FakeServer.respondOnceWith(otherDocumentUrl, async () => {
            await localEngine.updateDocument(
                documentUrl,
                [new DeleteResourceOperation(actionUrl()), new DeleteResourceOperation(`${actionUrl()}-metadata`)],
                { localChanges: () => null },
            );

            return FakeResponse.notFound();
        });

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await SyncJob.run({
            ...config,
            concurrency: 1,
            applicationModels: [
                { model: CascadingMovie, registration: true },
                { model: WatchAction, registration: false },
            ],
            resolveDeletionConflict,
        });

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

        expect(resolveDeletionConflict).not.toHaveBeenCalled();
        expect(localDocument.getQuads()).toHaveLength(0);
    });

    it('fails when resolving deletion conflicts fails', async () => {
        // Arrange
        const job = new SyncJob({
            ...config,
            applicationModels: [
                { model: CascadingMovie, registration: true },
                { model: WatchAction, registration: false },
            ],
            resolveDeletionConflict: async () => {
                throw new Error('Failed resolving conflict');
            },
        });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        const completed = expect(job.completed).rejects.toThrow('Failed resolving conflict');

        await expect(job.process()).rejects.toThrow('Failed resolving conflict');
        await completed;

        // Assert
        expect((await localEngine.readDocument(documentUrl)).contains(movieUrl())).toBe(true);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [actionUrl()]: { createdAt: expect.any(Date) } },
        });
    });

    it('finds conflicts again after cancelling', async () => {
        // Arrange
        let cancelling: Promise<void> | undefined;
        const job: SyncJob = new SyncJob({
            ...config,
            applicationModels: [
                { model: CascadingMovie, registration: true },
                { model: WatchAction, registration: false },
            ],
            resolveDeletionConflict: async () => {
                cancelling = job.cancel();

                return 'delete';
            },
        });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
        );

        await createLocalDocument(localEngine, documentUrl, syncFixture('movie-watched.ttl', { documentUrl }), {
            [actionUrl()]: { createdAt: new Date() },
        });

        // Act
        await Promise.allSettled([job.process()]);
        await cancelling;

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(localDocument.contains(movieUrl())).toBe(true);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toEqual({
            resources: { [actionUrl()]: { createdAt: expect.any(Date) } },
        });
    });

    function movieUrl(): string {
        return `${documentUrl}#it`;
    }

    function actionUrl(): string {
        return `${documentUrl}#action`;
    }

    function remoteDocument(contents: string, lastModifiedAt: string): Response {
        return FakeResponse.success(contents, { 'Last-Modified': new Date(lastModifiedAt).toUTCString() });
    }

    function operationTurtle(resourceUrl: string, name: string, date: string): string {
        return `
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${resourceUrl}-operation-${name}>
                a crdt:SetPropertyOperation ;
                crdt:resource <${resourceUrl}> ;
                crdt:property schema:name ;
                crdt:value "${name}" ;
                crdt:date "${date}"^^xsd:dateTime .
        `;
    }

    async function syncCascadingMovies(
        resolveDeletionConflict?: SyncJobConfig['resolveDeletionConflict'],
    ): Promise<void> {
        await SyncJob.run({
            ...config,
            applicationModels: [
                { model: CascadingMovie, registration: true },
                { model: WatchAction, registration: false },
            ],
            resolveDeletionConflict,
        });
    }

    function franchiseDocumentUrl(): string {
        return `${containerUrl}ghibli`;
    }

    function franchiseUrl(): string {
        return `${franchiseDocumentUrl()}#it`;
    }

    function franchiseTurtle(): string {
        return `
            <${franchiseUrl()}>
                a <https://schema.org/MovieSeries> ;
                <https://schema.org/name> "Ghibli" ;
                <https://schema.org/hasPart> <${movieUrl()}> .
        `;
    }

    async function syncFranchises(resolveDeletionConflict: SyncJobConfig['resolveDeletionConflict']): Promise<void> {
        await SyncJob.run({
            ...config,
            applicationModels: [
                { model: CascadingMovie, registration: true },
                { model: Franchise, registration: false },
                { model: WatchAction, registration: false },
            ],
            resolveDeletionConflict,
        });
    }

    function ratingUrl(): string {
        return `${documentUrl}#rating`;
    }

    function movieTurtle(options: { rated: boolean }): string {
        return `
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${movieUrl()}>
                a schema:Movie ;
                schema:name "The Substance" ${options.rated ? `; schema:aggregateRating <${ratingUrl()}>` : ''} .

            <${movieUrl()}-metadata>
                a crdt:Metadata ;
                crdt:resource <${movieUrl()}> ;
                crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:updatedAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
        `;
    }

    function ratingTurtle(): string {
        return `
            @prefix schema: <https://schema.org/> .

            <${ratingUrl()}> a schema:Rating ; schema:ratingValue 4 .
        `;
    }

    async function syncRatedMovies(): Promise<void> {
        await SyncJob.run({
            ...config,
            applicationModels: [
                { model: RatedMovie, registration: true },
                { model: Rating, registration: false },
            ],
            resolveDeletionConflict: async () => 'restore',
        });
    }
});
