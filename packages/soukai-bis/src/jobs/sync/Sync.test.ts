import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { arrayFilter, arraySorted, requireUrlDirectoryName } from '@noeldemartin/utils';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import Container from 'soukai-bis/models/ldp/Container';
import { anyOf } from 'soukai-bis/models/matching/fluent';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { string } from 'zod';

import Sync from './Sync';
import { createUnsyncedDocument, setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());
    });

    it('uses type indexes', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const userContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const firstMoviesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const secondMoviesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const postsContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Person')],
                instanceContainer: userContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('foaf:Person')],
                instanceContainer: userContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('schema:Movie')],
                instanceContainer: firstMoviesContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('schema:Movie')],
                instanceContainer: secondMoviesContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('schema:Article')],
                instanceContainer: postsContainerUrl,
            }),
        ];

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true },
                { model: Movie, registration: true },
            ],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenCalledWith(userContainerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenCalledWith(firstMoviesContainerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenCalledWith(secondMoviesContainerUrl, expect.anything());
    });

    it('reads nested containers', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: storageUrl });
        const nestedDocumentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('foaf:Person')],
                instanceContainer: storageUrl,
            }),
        ];

        FakeServer.respondOnce(storageUrl, containerTurtle([nestedContainerUrl, documentUrl]));
        FakeServer.respondOnce(nestedContainerUrl, containerTurtle([nestedDocumentUrl]));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenCalledWith(storageUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenCalledWith(nestedContainerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenCalledWith(nestedDocumentUrl, expect.anything());
    });

    it('handles missing remote documents', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        const typeIndexUrl = `${storageUrl}settings/privateTypeIndex`;
        const preferencesFileUrl = `${storageUrl}settings/prefs.ttl`;
        const registeredModels: ModelConstructor[] = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, syncFixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, syncFixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(config.userProfile.writableProfileUrl, FakeResponse.success());
        FakeServer.respondOnce(preferencesFileUrl, FakeResponse.success());

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...config.userProfile, preferencesFileUrl },
            privateTypeIndexes: [],
            applicationModels: [{ model: User, registration: true }],
            onModelsRegistered({ models }) {
                registeredModels.push(...models);
            },
        });

        // Assert
        expect(registeredModels).toEqual([User]);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(8);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA { ${syncFixture('person.ttl')} }
        `);

        expect(FakeServer.fetchSpy.mock.calls[7]?.[1]?.body).toEqualSparql(
            syncFixture('register-container.sparql', { containerUrl }),
        );
    });

    it('configures registration path', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const rootContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));
        const typeIndexUrl = `${storageUrl}settings/privateTypeIndex`;
        const preferencesFileUrl = `${storageUrl}settings/prefs.ttl`;
        const registeredContainers: string[] = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(config.userProfile.writableProfileUrl, FakeResponse.success());
        FakeServer.respondOnce(preferencesFileUrl, FakeResponse.success());
        FakeServer.respond(typeIndexUrl, syncFixture('type-index.ttl'));

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...config.userProfile, preferencesFileUrl },
            privateTypeIndexes: [],
            applicationModels: [
                { model: User, registration: { path: `/${requireUrlDirectoryName(rootContainerUrl)}/` } },
            ],
            onModelsRegistered({ typeIndex: registeredTypeIndex }) {
                registeredContainers.push(
                    ...arrayFilter(
                        registeredTypeIndex.registrations?.map((registration) => registration.instanceContainer) ?? [],
                    ),
                );
            },
        });

        // Assert
        expect(registeredContainers).toEqual([rootContainerUrl]);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(8);

        expect(FakeServer.fetchSpy.mock.calls[7]?.[1]?.body).toEqualSparql(
            syncFixture('register-container.sparql', { containerUrl: rootContainerUrl }),
        );
    });

    it('handles missing local documents', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(containerUrl, containerTurtle({ [documentUrl]: { lastModifiedAt } }));
        FakeServer.respond(
            documentUrl,
            FakeResponse.success(syncFixture('person.ttl'), {
                'Last-Modified': lastModifiedAt.toUTCString(),
            }),
        );

        // Act - First sync
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert - First sync
        const updatedLocalDocument = await localEngine.readDocument(documentUrl);
        const expectedLocalDocument = await quadsToJsonLD(
            turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })),
        );
        const actualLocalDocument = await quadsToJsonLD(updatedLocalDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect((await localEngine.getDocumentsLastModifiedAt())[documentUrl]).toEqual(lastModifiedAt);

        await expect(actualLocalDocument).toEqualJsonLD(expectedLocalDocument);

        // Act - Subsequent sync
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert - Subsequent sync
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, containerUrl, expect.anything());
    });

    it('syncs new local resources', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('movie.ttl', { documentUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD([
                ...turtleToQuadsSync(remoteDocument),
                ...turtleToQuadsSync(syncFixture('watch-action.ttl', { documentUrl })),
            ]),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: Movie, registration: true },
                { model: WatchAction, registration: false },
            ],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('add-watch-action.sparql'));
    });

    it('syncs local deletions', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('movie-watched.ttl', { documentUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD([
                ...turtleToQuadsSync(syncFixture('movie.ttl', { documentUrl })),
                ...turtleToQuadsSync(`
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <${documentUrl}#action-tombstone>
                        a crdt:Tombstone;
                        crdt:resource <${documentUrl}#action>;
                        crdt:deletedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                `),
            ]),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: Movie, registration: true },
                { model: WatchAction, registration: false },
            ],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('remove-watch-action.sparql'));
    });

    it('pulls containers with metadata', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, syncFixture('movies-container.ttl', { containerUrl, documentUrl }));
        FakeServer.respondOnce(documentUrl, syncFixture('movie.ttl', { documentUrl }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
        });

        // Assert
        const localDocument = await localEngine.readDocument(containerUrl);
        const expectedLocalDocument = await quadsToJsonLD(
            turtleToQuadsSync(syncFixture('movies-container.ttl', { containerUrl, documentUrl })),
        );
        const actualLocalDocument = await quadsToJsonLD(localDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());

        await expect(actualLocalDocument).toEqualJsonLD(expectedLocalDocument);
    });

    it('handles existing document on remote push', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('person-missing-second-name.ttl', { documentUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(documentUrl, FakeResponse.success(remoteDocument));

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.objectContaining({ method: 'PATCH' }));

        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(syncFixture('add-second-name.sparql'));
    });

    it('reports progress updates', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, syncFixture('movies-container.ttl', { containerUrl, documentUrl }));
        FakeServer.respondOnce(documentUrl, syncFixture('movie.ttl', { documentUrl }));

        const progressUpdates: number[] = [];

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
            onUpdated: (progress) => progressUpdates.push(progress),
        });

        // Assert
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[0]).toBe(0);
        expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
    });

    it('skips containers with deep last modified dates', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const registeredContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: registeredContainerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: registeredContainerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(
            registeredContainerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix purl: <http://purl.org/dc/terms/> .
                @prefix extra: <https://vocab.noeldemartin.com/solid-extra/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <>
                    a ldp:Container ;
                    ldp:contains <${nestedContainerUrl}> .

                <${nestedContainerUrl}>
                    a ldp:Resource, ldp:Container, ldp:BasicContainer ;
                    purl:modified "2026-06-13T07:00:59.000Z"^^xsd:dateTime ;
                    extra:deepLastModified "2026-06-19T07:17:00.000Z"^^xsd:dateTime .
            `,
        );

        await localEngine.createDocument(nestedContainerUrl, [], {
            lastModifiedAt: new Date('2026-06-19T07:17:00.000Z'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetch).toHaveBeenCalledWith(registeredContainerUrl, expect.anything());
    });

    it('pushes local changes under skipped containers', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const registeredContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: registeredContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: registeredContainerUrl,
                forClass: [expandIRI('schema:Movie')],
            }),
        ];

        FakeServer.respondOnce(
            registeredContainerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix purl: <http://purl.org/dc/terms/> .
                @prefix extra: <https://vocab.noeldemartin.com/solid-extra/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <>
                    a ldp:Container ;
                    ldp:contains <${nestedContainerUrl}> .

                <${nestedContainerUrl}>
                    a ldp:Resource, ldp:Container, ldp:BasicContainer ;
                    purl:modified "2026-06-13T07:00:59.000Z"^^xsd:dateTime ;
                    extra:deepLastModified "2026-06-19T07:17:00.000Z"^^xsd:dateTime ;
                    ldp:contains <${documentUrl}> .
            `,
        );

        await localEngine.createDocument(
            nestedContainerUrl,
            {
                '@id': nestedContainerUrl,
                '@type': ['http://www.w3.org/ns/ldp#Container', 'http://www.w3.org/ns/ldp#BasicContainer'],
                ['http://www.w3.org/ns/ldp#contains']: { '@id': documentUrl },
            },
            {
                lastModifiedAt: new Date('2026-06-19T07:17:00.000Z'),
            },
        );

        await createUnsyncedDocument(localEngine, documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('schema:Movie'),
            [expandIRI('schema:name')]: 'Interstellar',
        });

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.created());

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, registeredContainerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.objectContaining({ method: 'PATCH' }));
    });

    it('tolerates some errors', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const document1Url = fakeDocumentUrl({ containerUrl });
        const document2Url = fakeDocumentUrl({ containerUrl });
        const document3Url = fakeDocumentUrl({ containerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([document1Url, document2Url, document3Url]));
        FakeServer.respondOnce(document1Url, FakeResponse.internalServerError());
        FakeServer.respond(document2Url, syncFixture('person.ttl', { documentUrl: document2Url }));
        FakeServer.respond(document3Url, syncFixture('person.ttl', { documentUrl: document3Url }));

        // Act
        const result = {
            syncedDocumentUrls: new Set<string>(),
            documentsWithErrors: new Set<string>(),
        };

        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
            onFinished(res) {
                result.syncedDocumentUrls = res.syncedDocumentUrls;
                result.documentsWithErrors = res.documentsWithErrors;
            },
        });

        // Assert
        expect(result.syncedDocumentUrls.has(document1Url)).toBe(true);
        expect(result.syncedDocumentUrls.has(document2Url)).toBe(true);
        expect(result.syncedDocumentUrls.has(document3Url)).toBe(true);
        expect(result.documentsWithErrors.has(document1Url)).toBe(true);
        expect(result.documentsWithErrors.size).toBe(1);
    });

    it('ignores non-RDF resources declared in container metadata', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle([documentUrl, imageUrl])}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
                <${documentUrl}> a <http://www.w3.org/ns/iana/media-types/text/turtle#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));

        // Act
        const result = {
            syncedDocumentUrls: new Set<string>(),
            documentsWithErrors: new Set<string>(),
        };

        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
            onFinished(res) {
                result.syncedDocumentUrls = res.syncedDocumentUrls;
                result.documentsWithErrors = res.documentsWithErrors;
            },
        });

        // Assert
        expect(result.syncedDocumentUrls.has(documentUrl)).toBe(true);
        expect(result.syncedDocumentUrls.has(imageUrl)).toBe(false);
        expect(result.documentsWithErrors.size).toBe(0);
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
        expect(await localEngine.getLocalFile(imageUrl)).toBeNull();
    });

    it('ignores non-RDF documents returning 501 or 406', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const textUrl = `${containerUrl}notes.txt`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl, imageUrl, textUrl]));
        FakeServer.respond(documentUrl, syncFixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(imageUrl, new Response(null, { status: 501 }));
        FakeServer.respondOnce(textUrl, new Response(null, { status: 406 }));

        // Act
        const result = {
            syncedDocumentUrls: new Set<string>(),
            documentsWithErrors: new Set<string>(),
        };

        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            onFinished(res) {
                result.syncedDocumentUrls = res.syncedDocumentUrls;
                result.documentsWithErrors = res.documentsWithErrors;
            },
        });

        // Assert
        expect(result.syncedDocumentUrls.has(documentUrl)).toBe(true);
        expect(result.documentsWithErrors.size).toBe(0);
        expect(await localEngine.getLocalFile(imageUrl)).toMatchObject({ url: imageUrl, containerUrl });
        expect(await localEngine.getLocalFile(textUrl)).toMatchObject({ url: textUrl, containerUrl });
        expect(arraySorted((await Container.find(containerUrl))?.fileUrls ?? [])).toEqual([textUrl, imageUrl].sort());
    });

    it('syncs resources matching any of the model classes', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const localDocumentUrl = fakeDocumentUrl({ containerUrl });
        const TaskSchema = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfContexts: { ical: 'http://www.w3.org/2002/12/cal/ical#' },
            rdfClasses: anyOf(['Action', 'ical:Vtodo']),
            fields: { name: string().rdfProperties(['name', 'ical:summary']) },
        });

        class Task extends TaskSchema {}

        bootModels({ Task });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: ['http://www.w3.org/2002/12/cal/ical#Vtodo'],
            }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(
            documentUrl,
            `
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#> .

                <#it> a ical:Vtodo ; ical:summary "Learn Solid" .
            `,
        );
        FakeServer.respond(localDocumentUrl, FakeResponse.notFound());
        FakeServer.respond(localDocumentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            localEngine,
            localDocumentUrl,
            turtleToQuadsSync(
                `
                    @prefix schema: <https://schema.org/> .

                    <#it> a schema:Action ; schema:name "Write docs" .
                `,
                { baseIRI: localDocumentUrl },
            ),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Task, registration: true }],
        });

        // Assert
        const localDocument = await localEngine.readDocument(documentUrl);

        expect(FakeServer.fetch).toHaveBeenCalledWith(containerUrl, expect.anything());
        expect(
            localDocument.statements(`${documentUrl}#it`, 'http://www.w3.org/2002/12/cal/ical#summary')[0]?.object
                .value,
        ).toEqual('Learn Solid');
        expect(
            FakeServer.getRequests().some((request) => request.method !== 'GET' && request.url === localDocumentUrl),
        ).toBe(true);
    });
});
