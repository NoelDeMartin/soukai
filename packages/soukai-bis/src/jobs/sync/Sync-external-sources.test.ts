import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { arraySorted, urlRoute } from '@noeldemartin/utils';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type { ExternalSource } from 'soukai-bis/jobs/utils';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import type { ModelConstructor } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import User from 'soukai-bis/testing/stubs/User';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import Sync from './Sync';
import { createUnsyncedDocument, setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync external sources', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    const otherStorageUrl = 'https://other-pod.com/';

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());
    });

    it('pulls external containers and instances without registering them', async () => {
        // Arrange
        const containerUrl = `${otherStorageUrl}movies/`;
        const documentUrl = `${containerUrl}the-substance`;
        const instanceUrl = `${otherStorageUrl}people/alice#it`;
        const registeredModels: ModelConstructor[][] = [];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(documentUrl, syncFixture('movie.ttl', { documentUrl }));
        FakeServer.respond(urlRoute(instanceUrl), syncFixture('person.ttl', { documentUrl: urlRoute(instanceUrl) }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: Movie, registration: true },
                { model: User, registration: true },
            ],
            externalSources: [
                { containerUrl, models: [Movie] },
                { instanceUrl, models: [User] },
            ],
            onModelsRegistered: ({ models }) => registeredModels.push(models),
        });

        // Assert
        expect(await localEngine.readDocumentIfExists(documentUrl)).not.toBeNull();
        expect(await localEngine.readDocumentIfExists(urlRoute(instanceUrl))).not.toBeNull();
        expect(registeredModels).toEqual([]);
        expect(FakeServer.getRequests().every((request) => request.method === 'GET')).toBe(true);
    });

    it('pushes local documents in external sources without registering them', async () => {
        // Arrange
        const containerUrl = `${otherStorageUrl}movies/`;
        const documentUrl = `${containerUrl}the-substance`;
        const registeredModels: ModelConstructor[][] = [];

        FakeServer.respond(containerUrl, containerTurtle([]));
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('movie.ttl', { documentUrl }))),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
            externalSources: [{ containerUrl, models: [Movie] }],
            onModelsRegistered: ({ models }) => registeredModels.push(models),
        });

        // Assert
        expect(FakeServer.getRequests('PATCH', documentUrl)).toHaveLength(1);
        expect(FakeServer.getRequests().filter(({ method }) => method === 'PATCH')).toHaveLength(1);
        expect(registeredModels).toEqual([]);
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toBeInstanceOf(Date);
    });

    it('pushes external instances missing remotely', async () => {
        // Arrange
        const instanceUrl = `${otherStorageUrl}people/alice#it`;
        const documentUrl = urlRoute(instanceUrl);

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.created());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl }))),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
            externalSources: [{ instanceUrl, models: [User] }],
        });

        // Assert
        expect(FakeServer.getRequests('PATCH', documentUrl)).toHaveLength(1);
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('pushes external instances once', async () => {
        // Arrange
        const instanceUrl = `${otherStorageUrl}people/alice#it`;
        const documentUrl = urlRoute(instanceUrl);

        FakeServer.respond(documentUrl, syncFixture('person-missing-second-name.ttl', { documentUrl }));

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl }))),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
            externalSources: [{ instanceUrl, models: [User] }],
        });

        // Assert
        expect(FakeServer.getRequests('PATCH', documentUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(syncFixture('add-second-name.sparql'));
        expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
    });

    it('keeps syncing external sources with failing documents', async () => {
        // Arrange
        const containerUrl = `${otherStorageUrl}movies/`;
        const brokenDocumentUrl = `${containerUrl}broken`;
        const workingDocumentUrl = `${containerUrl}the-substance`;
        const failedSources: ExternalSource[] = [];
        const result = { documentsWithErrors: new Set<string>() };

        FakeServer.respond(containerUrl, containerTurtle([brokenDocumentUrl, workingDocumentUrl]));
        FakeServer.respond(brokenDocumentUrl, FakeResponse.internalServerError());
        FakeServer.respond(workingDocumentUrl, syncFixture('movie.ttl', { documentUrl: workingDocumentUrl }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
            externalSources: [{ containerUrl, models: [Movie] }],
            onExternalSourceFailed: (source) => failedSources.push(source),
            onFinished: (res) => (result.documentsWithErrors = res.documentsWithErrors),
        });

        // Assert
        expect(await localEngine.readDocumentIfExists(workingDocumentUrl)).not.toBeNull();
        expect(result.documentsWithErrors).toEqual(new Set([brokenDocumentUrl]));
        expect(failedSources).toHaveLength(1);
    });

    it('reports errors per source without failing the sync', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const ownContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const ownDocumentUrl = fakeDocumentUrl({ containerUrl: ownContainerUrl });
        const forbiddenContainerUrl = `${otherStorageUrl}forbidden/`;
        const brokenContainerUrl = 'https://broken-pod.com/movies/';
        const workingContainerUrl = 'https://working-pod.com/movies/';
        const workingDocumentUrl = `${workingContainerUrl}the-substance`;
        const failedSources: [string, unknown][] = [];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: ownContainerUrl, forClass: [expandIRI('schema:Movie')] }),
        ];

        FakeServer.respond(ownContainerUrl, containerTurtle([ownDocumentUrl]));
        FakeServer.respond(ownDocumentUrl, syncFixture('movie.ttl', { documentUrl: ownDocumentUrl }));
        FakeServer.respond(forbiddenContainerUrl, new Response(null, { status: 403 }));
        FakeServer.respond(brokenContainerUrl, FakeResponse.internalServerError());
        FakeServer.respond(workingContainerUrl, containerTurtle([workingDocumentUrl]));
        FakeServer.respond(workingDocumentUrl, syncFixture('movie.ttl', { documentUrl: workingDocumentUrl }));

        // Act
        const result = { documentsWithErrors: new Set<string>() };

        await Sync.run({
            ...config,
            maxErrors: 1,
            applicationModels: [{ model: Movie, registration: true }],
            externalSources: [
                { containerUrl: forbiddenContainerUrl, models: [Movie] },
                { containerUrl: brokenContainerUrl, models: [Movie] },
                { containerUrl: workingContainerUrl, models: [Movie] },
            ],
            onExternalSourceFailed: (source, error) => failedSources.push([source.containerUrl ?? '', error]),
            onFinished: (res) => (result.documentsWithErrors = res.documentsWithErrors),
        });

        // Assert
        expect(arraySorted(failedSources.map(([url]) => url))).toEqual(
            arraySorted([forbiddenContainerUrl, brokenContainerUrl]),
        );
        expect(result.documentsWithErrors).toEqual(new Set([forbiddenContainerUrl, brokenContainerUrl]));
        expect(await localEngine.readDocumentIfExists(ownDocumentUrl)).not.toBeNull();
        expect(await localEngine.readDocumentIfExists(workingDocumentUrl)).not.toBeNull();
    });
});
