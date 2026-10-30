import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { arrayFilter, requireUrlDirectoryName } from '@noeldemartin/utils';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import type { SyncConfig } from './Sync';

describe('Sync', () => {
    let localEngine: InMemoryEngine;
    let remoteEngine: SolidEngine;
    let typeIndex: TypeIndex;
    let config: Pick<SyncConfig, 'userProfile' | 'localEngine' | 'remoteEngine' | 'privateTypeIndexes'>;

    const fixture = <T = string>(name: string, replacements: Record<string, string> = {}) =>
        loadFixture<T>(new URL(`./Sync.test.ts-fixtures/${name}`, import.meta.url), replacements);

    function fakeTypeIndex(url: string, registrations: TypeRegistration[] = []): TypeIndex {
        const typeIndex = new TypeIndex({ url }, { exists: true });

        typeIndex.relatedRegistrations.related = registrations;

        FakeServer.respond(url, FakeResponse.success());

        return typeIndex;
    }

    const userProfile = {
        webId: 'https://myprofile.com/profile#me',
        storageUrls: ['https://my-pod.com/'],
        shallow: false,
        cloakedDocumentUrls: [],
        publicTypeIndexUrls: [],
        privateTypeIndexUrls: [],
        writableProfileUrl: 'https://myprofile.com/profile',
    } satisfies CompleteSolidUserProfile;

    beforeEach(() => {
        localEngine = new InMemoryEngine();
        remoteEngine = new SolidEngine({ fetch: FakeServer.fetch });
        typeIndex = new TypeIndex();
        config = {
            userProfile,
            localEngine,
            remoteEngine,
            privateTypeIndexes: [typeIndex],
        };

        TypeIndex.setEngine(remoteEngine);
        TypeRegistration.setEngine(remoteEngine);
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

    it('syncs new operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = fixture('person-missing-second-name.ttl');
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument); // FIXME avoid calling this twice
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-second-name.sparql'));
    });

    it('syncs old operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = fixture('person-missing-third-name.ttl');
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument); // FIXME avoid calling this twice
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-third-name.sparql'));
    });

    it('syncs remote and local operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = fixture('person-missing-third-name.ttl');
        const localDocument = await quadsToJsonLD(
            turtleToQuadsSync(fixture('person-missing-second-name.ttl', { documentUrl })),
        );

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument); // FIXME avoid calling this twice
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        const updatedLocalDocument = await localEngine.readDocument(documentUrl);
        const expectedLocalDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const actualLocalDocument = await quadsToJsonLD(updatedLocalDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        await expect(actualLocalDocument).toEqualJsonLD(expectedLocalDocument);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-third-name.sparql'));
    });

    it('handles missing remote documents', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const typeIndexUrl = `${storageUrl}settings/privateTypeIndex`;
        const preferencesFileUrl = `${storageUrl}settings/prefs.ttl`;
        const registeredModels: ModelConstructor[] = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, fixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, fixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(userProfile.writableProfileUrl, FakeResponse.success());
        FakeServer.respondOnce(preferencesFileUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...userProfile, preferencesFileUrl },
            privateTypeIndexes: [],
            applicationModels: [{ model: User, registration: true }],
            onModelsRegistered(_, models) {
                registeredModels.push(...models);
            },
        });

        // Assert
        expect(registeredModels).toEqual([User]);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(8);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA { ${fixture('person.ttl')} }
        `);

        expect(FakeServer.fetchSpy.mock.calls[7]?.[1]?.body).toEqualSparql(
            fixture('register-container.sparql', { containerUrl }),
        );
    });

    it('configures registration path', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const rootContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const typeIndexUrl = `${storageUrl}settings/privateTypeIndex`;
        const preferencesFileUrl = `${storageUrl}settings/prefs.ttl`;
        const registeredContainers: string[] = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(userProfile.writableProfileUrl, FakeResponse.success());
        FakeServer.respondOnce(preferencesFileUrl, FakeResponse.success());
        FakeServer.respond(typeIndexUrl, fixture('type-index.ttl'));

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...userProfile, preferencesFileUrl },
            privateTypeIndexes: [],
            applicationModels: [
                { model: User, registration: { path: `/${requireUrlDirectoryName(rootContainerUrl)}/` } },
            ],
            onModelsRegistered(registeredTypeIndex) {
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
            fixture('register-container.sparql', { containerUrl: rootContainerUrl }),
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
            FakeResponse.success(fixture('person.ttl'), {
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
        const expectedLocalDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const actualLocalDocument = await quadsToJsonLD(updatedLocalDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(updatedLocalDocument.getLastModified()).toEqual(lastModifiedAt);

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
        const remoteDocument = fixture('movie.ttl', { documentUrl });

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

        Movie.setEngine(localEngine);
        WatchAction.setEngine(localEngine);

        await localEngine.createDocument(
            documentUrl,
            await quadsToJsonLD([
                ...turtleToQuadsSync(remoteDocument),
                ...turtleToQuadsSync(fixture('watch-action.ttl', { documentUrl })),
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

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-watch-action.sparql'));
    });

    it('syncs local deletions', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = fixture('movie-watched.ttl', { documentUrl });

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

        Movie.setEngine(localEngine);
        WatchAction.setEngine(localEngine);

        await localEngine.createDocument(
            documentUrl,
            await quadsToJsonLD([
                ...turtleToQuadsSync(fixture('movie.ttl', { documentUrl })),
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

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('remove-watch-action.sparql'));
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

        FakeServer.respondOnce(containerUrl, fixture('movies-container.ttl', { containerUrl, documentUrl }));
        FakeServer.respondOnce(documentUrl, fixture('movie.ttl', { documentUrl }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Movie, registration: true }],
        });

        // Assert
        const localDocument = await localEngine.readDocument(containerUrl);
        const expectedLocalDocument = await quadsToJsonLD(
            turtleToQuadsSync(fixture('movies-container.ttl', { containerUrl, documentUrl })),
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
        const remoteDocument = fixture('person-missing-second-name.ttl', { documentUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respond(documentUrl, FakeResponse.success(remoteDocument));

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.objectContaining({ method: 'PATCH' }));

        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(fixture('add-second-name.sparql'));
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

        FakeServer.respondOnce(containerUrl, fixture('movies-container.ttl', { containerUrl, documentUrl }));
        FakeServer.respondOnce(documentUrl, fixture('movie.ttl', { documentUrl }));

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

        await localEngine.createDocument(documentUrl, {
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
        FakeServer.respond(document2Url, fixture('person.ttl', { documentUrl: document2Url }));
        FakeServer.respond(document3Url, fixture('person.ttl', { documentUrl: document3Url }));

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

    describe('type index registration', () => {
        let containerUrl: string;
        let documentUrl: string;
        let publicTypeIndex: TypeIndex;
        let privateTypeIndex: TypeIndex;
        let registeredModels: [TypeIndex, ModelConstructor[]][];

        beforeEach(async () => {
            const storageUrl = config.userProfile.storageUrls[0];

            containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
            documentUrl = fakeDocumentUrl({ containerUrl });
            publicTypeIndex = fakeTypeIndex(`${storageUrl}settings/publicTypeIndex`);
            privateTypeIndex = fakeTypeIndex(`${storageUrl}settings/privateTypeIndex`);
            registeredModels = [];

            FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
            FakeServer.respondOnce(documentUrl, FakeResponse.success());

            await localEngine.createDocument(
                documentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl }))),
            );
        });

        const onModelsRegistered = (typeIndex: TypeIndex, models: ModelConstructor[]) => {
            registeredModels.push([typeIndex, models]);
        };

        it('registers models in the private type index by default', async () => {
            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[0]).toBe(privateTypeIndex);
            expect(registeredModels[0]?.[1]).toEqual([User]);
            expect(FakeServer.getRequests(publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', privateTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-container.sparql', { containerUrl }),
            );
        });

        it('registers public models in the public type index', async () => {
            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { public: true } }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[0]).toBe(publicTypeIndex);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', publicTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-container.sparql', { containerUrl }),
            );
        });

        it('creates missing public type indexes', async () => {
            // Arrange
            const createPublicTypeIndex = vi.fn(async () => publicTypeIndex);
            const createPrivateTypeIndex = vi.fn(async () => privateTypeIndex);

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [],
                privateTypeIndexes: [],
                createPublicTypeIndex,
                createPrivateTypeIndex,
                applicationModels: [{ model: User, registration: { public: true } }],
                onModelsRegistered,
            });

            // Assert
            expect(createPublicTypeIndex).toHaveBeenCalledOnce();
            expect(createPrivateTypeIndex).not.toHaveBeenCalled();
            expect(registeredModels[0]?.[0]).toBe(publicTypeIndex);
        });

        it('skips models registered in the other type index', async () => {
            // Arrange
            publicTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instanceContainer: containerUrl }),
            ];

            FakeServer.respond(containerUrl, containerTurtle([]));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(FakeServer.getRequests(publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
        });

        it('skips models registered in any of the type indexes', async () => {
            // Arrange
            const secondPrivateTypeIndex = fakeTypeIndex(`${privateTypeIndex.requireUrl()}-2`, [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instanceContainer: containerUrl }),
            ]);

            FakeServer.respond(containerUrl, containerTurtle([]));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex, secondPrivateTypeIndex],
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequests(secondPrivateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
        });

        it('registers models with containers registered for some of their classes', async () => {
            // Arrange
            class Agent extends defineSchema(User, { rdfClass: 'Agent' }) {}

            bootModels({ Agent });

            privateTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instanceContainer: containerUrl }),
            ];

            FakeServer.respond(containerUrl, containerTurtle([]));

            await localEngine.deleteDocument(documentUrl);
            await localEngine.createDocument(
                documentUrl,
                await quadsToJsonLD(
                    turtleToQuadsSync(
                        fixture('person.ttl', { documentUrl }).replace('a foaf:Person', 'a foaf:Person, foaf:Agent'),
                    ),
                ),
            );

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: Agent, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[0]).toBe(privateTypeIndex);
            expect(registeredModels[0]?.[1]).toEqual([Agent]);
        });

        it('does not register models for documents with some of their classes', async () => {
            // Arrange
            class Agent extends defineSchema(User, { rdfClass: 'Agent' }) {}

            bootModels({ Agent });

            FakeServer.respond(containerUrl, containerTurtle([]));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: Agent, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
        });

        it('keeps pushing when type indexes cannot be created', async () => {
            // Arrange
            const nestedContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
            const nestedDocumentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });
            const error = new Error('Preferences file is cloaked');
            const createPrivateTypeIndex = vi.fn<() => Promise<TypeIndex>>().mockRejectedValue(error);
            const failedRegistrations: [ModelConstructor[], unknown][] = [];

            FakeServer.respondOnce(nestedDocumentUrl, FakeResponse.notFound());
            FakeServer.respondOnce(nestedDocumentUrl, FakeResponse.success());

            await localEngine.createDocument(
                nestedDocumentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl: nestedDocumentUrl }))),
            );

            // Act
            await Sync.run({
                ...config,
                privateTypeIndexes: [],
                createPrivateTypeIndex,
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
                onModelsRegistrationFailed: (models, registrationError) => {
                    failedRegistrations.push([models, registrationError]);
                },
            });

            // Assert
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
            expect(FakeServer.getRequest('PATCH', nestedDocumentUrl)).not.toBeNull();
            expect(createPrivateTypeIndex).toHaveBeenCalledOnce();
            expect(registeredModels).toHaveLength(0);
            expect(failedRegistrations).toEqual([
                [[User], error],
                [[User], error],
            ]);
            expect((await localEngine.readDocument(documentUrl)).getLastModified()).toBeNull();
            expect((await localEngine.readDocument(nestedDocumentUrl)).getLastModified()).toBeNull();

            // Act - Retry
            FakeServer.respondOnce(documentUrl, fixture('person.ttl', { documentUrl }));
            FakeServer.respondOnce(nestedDocumentUrl, fixture('person.ttl', { documentUrl: nestedDocumentUrl }));

            await Sync.run({
                ...config,
                privateTypeIndexes: [],
                createPrivateTypeIndex: async () => privateTypeIndex,
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
            });

            // Assert - Retry
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[0]).toBe(privateTypeIndex);
            expect(privateTypeIndex.registrations?.map((registration) => registration.instanceContainer)).toEqual([
                containerUrl,
            ]);
            expect((await localEngine.readDocument(documentUrl)).getLastModified()).not.toBeNull();
            expect((await localEngine.readDocument(nestedDocumentUrl)).getLastModified()).not.toBeNull();
        });
    });
});
