import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { arrayFilter, arraySorted, arrayUnique, requireUrlDirectoryName, urlRoute } from '@noeldemartin/utils';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import type { ResourceLocalChanges } from 'soukai-bis/engines/LocalEngine';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type { ExternalSource } from 'soukai-bis/jobs/utils';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import Container from 'soukai-bis/models/ldp/Container';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import { anyOf } from 'soukai-bis/models/matching/fluent';
import { bootModels } from 'soukai-bis/models/registry';
import { belongsToMany, belongsToOne, hasMany } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Rating from 'soukai-bis/testing/stubs/Rating';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { array, string, url } from 'zod';

import Sync from './Sync';
import type { FilePushedEvent, ModelRegistrationMode, ModelsRegisteredEvent } from './Sync';
import type { SyncConfig } from './Sync';

describe('Sync', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: Pick<SyncConfig, 'userProfile' | 'privateTypeIndexes'>;

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

    async function createUnsyncedDocument(
        url: string,
        contents: Parameters<InMemoryEngine['createDocument']>[1],
    ): Promise<void> {
        const document = await localEngine.createDocument(url, contents);
        const resourceUrls = arrayUnique(
            document
                .statements(undefined, expandIRI('rdf:type'))
                .map((quad) => quad.subject.value)
                .filter((resourceUrl) => resourceUrl !== url),
        );

        await localEngine.updateDocument(url, [], {
            localChanges: () => ({
                resources: Object.fromEntries(
                    resourceUrls.map((resourceUrl) => [resourceUrl, { createdAt: new Date() }]),
                ),
            }),
        });
    }

    beforeEach(() => {
        localEngine = new InMemoryEngine();
        typeIndex = new TypeIndex();
        config = {
            userProfile,
            privateTypeIndexes: [typeIndex],
        };

        setEngine(localEngine);
    });

    it('requires a local engine', async () => {
        // Arrange
        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));

        const job = new Sync({ ...config, applicationModels: [] });
        const completed = expect(job.completed).rejects.toThrow(SoukaiError);

        // Act & Assert
        await expect(job.process()).rejects.toThrow(SoukaiError);
        await completed;
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

        await createUnsyncedDocument(documentUrl, localDocument);

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

        await createUnsyncedDocument(documentUrl, localDocument);

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

        await createUnsyncedDocument(documentUrl, localDocument);

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

    it('syncs array operations from different devices', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const personTurtle = (friends: string[], operations: string) => `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                a foaf:Person ;
                foaf:name "Alice" ;
                foaf:knows ${friends.map((friend) => `<#${friend}>`).join(', ')} .

            <#operation-1>
                a crdt:SetPropertyOperation ;
                crdt:resource <#it> ;
                crdt:property foaf:knows ;
                crdt:value <#bob> ;
                crdt:date "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

            ${operations}
        `;
        const remoteDocument = personTurtle(
            ['bob', 'charlie'],
            `
                <#operation-2>
                    a crdt:AddPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:property foaf:knows ;
                    crdt:value <#charlie> ;
                    crdt:date "2021-01-02T00:00:00.000Z"^^xsd:dateTime .
            `,
        );
        const localOperation = `
            <#operation-3>
                a crdt:AddPropertyOperation ;
                crdt:resource <#it> ;
                crdt:property foaf:knows ;
                crdt:value <#dave> ;
                crdt:date "2021-01-03T00:00:00.000Z"^^xsd:dateTime .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            documentUrl,
            turtleToQuadsSync(personTurtle(['bob', 'dave'], localOperation), { baseIRI: documentUrl }),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        const user = await User.findOrFail(`${documentUrl}#it`);

        expect(user.friendUrls?.slice().sort()).toEqual([
            `${documentUrl}#bob`,
            `${documentUrl}#charlie`,
            `${documentUrl}#dave`,
        ]);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it> foaf:knows <#dave> .

                ${localOperation}
            }
        `);
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

        await createUnsyncedDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...userProfile, preferencesFileUrl },
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

        await createUnsyncedDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            userProfile: { ...userProfile, preferencesFileUrl },
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

        await createUnsyncedDocument(
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

        await createUnsyncedDocument(
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

    it('syncs soft deletes', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = `
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                a schema:WatchAction ;
                schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

            <#it-metadata>
                a crdt:Metadata ;
                crdt:resource <#it> ;
                crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:updatedAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:WatchAction')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            documentUrl,
            turtleToQuadsSync(
                `
                    @prefix schema: <https://schema.org/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it>
                        a schema:WatchAction ;
                        schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:updatedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:deletedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:DeleteOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
                `,
                { baseIRI: documentUrl },
            ),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: WatchAction, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.objectContaining({ method: 'PATCH' }));
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it-metadata> crdt:updatedAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime .
            } ;

            INSERT DATA {
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it-operation-1>
                    a crdt:DeleteOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#it-metadata>
                    crdt:deletedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "2022-01-01T00:00:00.000Z"^^xsd:dateTime .
            }
        `);
    });

    it('keeps the latest soft delete or restore', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = `
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                a schema:WatchAction ;
                schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

            <#it-metadata>
                a crdt:Metadata ;
                crdt:resource <#it> ;
                crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:updatedAt "2023-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:deletedAt "2023-01-01T00:00:00.000Z"^^xsd:dateTime .

            <#it-operation-3>
                a crdt:DeleteOperation ;
                crdt:resource <#it> ;
                crdt:date "2023-01-01T00:00:00.000Z"^^xsd:dateTime .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:WatchAction')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            documentUrl,
            turtleToQuadsSync(
                `
                    @prefix schema: <https://schema.org/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it>
                        a schema:WatchAction ;
                        schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:updatedAt "2022-06-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:DeleteOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-2>
                        a crdt:RestoreOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-06-01T00:00:00.000Z"^^xsd:dateTime .
                `,
                { baseIRI: documentUrl },
            ),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: WatchAction, registration: true }],
        });

        // Assert
        const localAction = await WatchAction.find(`${documentUrl}#it`, { includeSoftDeleted: true });

        expect(localAction?.isSoftDeleted()).toBe(true);
        expect(localAction?.metadata?.deletedAt).toEqual(new Date('2023-01-01T00:00:00.000Z'));
        expect(await WatchAction.find(`${documentUrl}#it`)).toBeNull();

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it-operation-1>
                    a crdt:DeleteOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-2>
                    a crdt:RestoreOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2022-06-01T00:00:00.000Z"^^xsd:dateTime .
            }
        `);
    });

    it('prefers soft deletes over restores with the same date', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = `
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                a schema:WatchAction ;
                schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

            <#it-metadata>
                a crdt:Metadata ;
                crdt:resource <#it> ;
                crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:updatedAt "2022-06-01T00:00:00.000Z"^^xsd:dateTime ;
                crdt:deletedAt "2022-06-01T00:00:00.000Z"^^xsd:dateTime .

            <#it-operation-3>
                a crdt:DeleteOperation ;
                crdt:resource <#it> ;
                crdt:date "2022-06-01T00:00:00.000Z"^^xsd:dateTime .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('schema:WatchAction')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, remoteDocument);
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            documentUrl,
            turtleToQuadsSync(
                `
                    @prefix schema: <https://schema.org/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it>
                        a schema:WatchAction ;
                        schema:startTime "2021-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "2021-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:updatedAt "2022-06-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:DeleteOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-2>
                        a crdt:RestoreOperation ;
                        crdt:resource <#it> ;
                        crdt:date "2022-06-01T00:00:00.000Z"^^xsd:dateTime .
                `,
                { baseIRI: documentUrl },
            ),
        );

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: WatchAction, registration: true }],
        });

        // Assert
        expect(await WatchAction.find(`${documentUrl}#it`)).toBeNull();
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it-operation-1>
                    a crdt:DeleteOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2022-01-01T00:00:00.000Z"^^xsd:dateTime .

                <#it-operation-2>
                    a crdt:RestoreOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2022-06-01T00:00:00.000Z"^^xsd:dateTime .
            }
        `);
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

        await createUnsyncedDocument(documentUrl, localDocument);

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

        await createUnsyncedDocument(documentUrl, {
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
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));

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
        expect(await localEngine.getFile(imageUrl)).toBeNull();
    });

    it('pulls container files metadata', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const imageModifiedAt = new Date('2026-11-17T07:00:00Z');
        const invalidateComputedAttributesCache = vi.spyOn(ComputedAttributesCache.requireInstance(), 'invalidate');
        let syncedFileUrls = new Set<string>();

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle({ [documentUrl]: { lastModifiedAt: new Date() }, [imageUrl]: { lastModifiedAt: imageModifiedAt } })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        const localContainer = await localEngine.readDocument(containerUrl);
        const file = await localEngine.getFile(imageUrl);

        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg', lastModifiedAt: imageModifiedAt });
        expect(file?.blob).toBeUndefined();
        expect(syncedFileUrls).toEqual(new Set([imageUrl]));
        expect(invalidateComputedAttributesCache).toHaveBeenCalledWith({
            documentUrls: expect.arrayContaining([imageUrl]),
        });
        expect(localContainer.statements(containerUrl, 'ldp:contains', imageUrl)).toHaveLength(1);
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
    });

    it('downloads offline container files', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle([documentUrl, imageUrl])}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/jpeg' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
            ],
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg', availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('reports offline files download progress', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const progressUpdates: number[] = [];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle([documentUrl, imageUrl])}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/jpeg' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
            ],
            onUpdated: (progress) => progressUpdates.push(progress),
        });

        // Assert
        expect(progressUpdates).toContain(0.9);
        expect(progressUpdates.at(-1)).toEqual(1);
        expect(progressUpdates.indexOf(0.9)).toBeLessThan(progressUpdates.indexOf(1));
    });

    it('removes files deleted remotely', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));

        await localEngine.updateFile(imageUrl, { mimeType: 'image/jpeg', lastModifiedAt: new Date() });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toBeNull();
    });

    it('pulls container files again after failing to process them', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const registeredContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const nestedContainerUrl = fakeContainerUrl({ baseUrl: registeredContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: nestedContainerUrl });
        const imageUrl = `${nestedContainerUrl}image.jpg`;
        const applicationModels = [{ model: User, registration: true, files: [{ strategy: 'container' as const }] }];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: registeredContainerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            registeredContainerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix extra: <https://vocab.noeldemartin.com/solid-extra/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <> a ldp:Container ; ldp:contains <${nestedContainerUrl}> .

                <${nestedContainerUrl}>
                    a ldp:Resource, ldp:Container, ldp:BasicContainer ;
                    extra:deepLastModified "2026-06-19T07:17:00.000Z"^^xsd:dateTime .
            `,
        );
        FakeServer.respond(
            nestedContainerUrl,
            `
                ${containerTurtle({
                    [documentUrl]: { lastModifiedAt: new Date('2026-06-19T07:17:00.000Z') },
                    [imageUrl]: { lastModifiedAt: new Date('2026-06-19T07:17:00.000Z') },
                })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
                <> <https://vocab.noeldemartin.com/solid-extra/deepLastModified>
                    "2026-06-19T07:17:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            `,
        );
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));

        const updateFile = vi.spyOn(localEngine, 'updateFile').mockRejectedValueOnce(new Error('Interrupted'));

        await Sync.run({ ...config, applicationModels });

        updateFile.mockRestore();

        // Act
        await Sync.run({ ...config, applicationModels });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, mimeType: 'image/jpeg' });
    });

    it('skips files rules when nothing changed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.jpg`;
        const documentModifiedAt = new Date('2026-11-17T07:00:00Z');
        const imageModifiedAt = new Date('2026-11-17T08:00:00Z');

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(
            containerUrl,
            `
                ${containerTurtle({
                    [documentUrl]: { lastModifiedAt: documentModifiedAt },
                    [imageUrl]: { lastModifiedAt: imageModifiedAt },
                })}
                <${imageUrl}> a <http://www.w3.org/ns/iana/media-types/image/jpeg#Resource> .
            `,
        );

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })), {
            lastModifiedAt: documentModifiedAt,
        });
        await localEngine.updateFile(imageUrl, { mimeType: 'image/jpeg', lastModifiedAt: imageModifiedAt });

        const readDocuments = vi.spyOn(localEngine, 'readDocuments');
        const getContainerUrls = vi.spyOn(localEngine, 'getContainerUrls');

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: true,
                    files: [
                        { strategy: 'container' },
                        { strategy: 'document', fields: ['friendUrls'], availableOffline: true },
                    ],
                },
            ],
        });

        // Assert
        expect(FakeServer.getRequests(documentUrl)).toHaveLength(0);
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
        expect(readDocuments).not.toHaveBeenCalledWith(expect.objectContaining({ containerUrl }));
        expect(getContainerUrls).not.toHaveBeenCalled();
    });

    it('pushes local files', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;
        const pushedFiles: FilePushedEvent[] = [];
        let syncedFileUrls = new Set<string>();

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
            onFilePushed: (event) => pushedFiles.push(event),
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        const file = await localEngine.getFile(imageUrl);

        expect(FakeServer.getRequest('PUT', imageUrl)?.headers).toEqual({
            'Content-Type': 'image/png',
            'If-None-Match': '*',
        });
        expect(file).toMatchObject({ url: imageUrl, mimeType: 'image/png' });
        expect(file?.blob).toBeUndefined();
        expect(file?.lastModifiedAt).toBeInstanceOf(Date);
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        expect(syncedFileUrls.has(imageUrl)).toBe(true);
        expect(pushedFiles).toHaveLength(1);
        expect(pushedFiles[0]).toMatchObject({ url: imageUrl });
        expect(await pushedFiles[0]?.blob.text()).toEqual('image');
    });

    it('keeps files modified locally while they are pushed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnceWith(imageUrl, async () => {
            vi.advanceTimersByTime(1000);

            await localEngine.writeFile(imageUrl, new Blob(['modified'], { type: 'image/png' }), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            return FakeResponse.created();
        });

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('modified');
    });

    it('keeps offline files after pushing them', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;
        const pushedFiles: FilePushedEvent[] = [];

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: false, files: [{ strategy: 'container', availableOffline: true }] },
            ],
            onFilePushed: (event) => pushedFiles.push(event),
        });

        // Assert
        expect(FakeServer.getRequest('PUT', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
        expect(pushedFiles).toHaveLength(0);
    });

    it('pushes local file deletions', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnce(imageUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image']), { lastModifiedAt: new Date() });
        await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(FakeServer.getRequest('DELETE', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('keeps files uploaded locally while their deletion is pushed', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        FakeServer.respondOnceWith(imageUrl, async () => {
            vi.advanceTimersByTime(1000);

            await localEngine.writeFile(imageUrl, new Blob(['uploaded'], { type: 'image/png' }), {
                localChanges: fileLocalChanges(imageUrl, 'created'),
            });

            return FakeResponse.success();
        });

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image']), { lastModifiedAt: new Date() });
        await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: User, registration: false, files: [{ strategy: 'container' }] }],
        });

        // Assert
        expect(FakeServer.getRequest('DELETE', imageUrl)).not.toBeNull();
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ lastModifiedAt: null });
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('uploaded');
    });

    it('downloads offline files referenced in document fields', async () => {
        // Arrange
        let syncedFileUrls = new Set<string>();
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(
            documentUrl,
            `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Alice" ;
                <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
        );
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: true,
                    files: [{ strategy: 'document', fields: ['friendUrls'], availableOffline: true }],
                },
            ],
            onFinished: (result) => (syncedFileUrls = result.syncedFileUrls),
        });

        // Assert
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, availableOffline: true });
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
        expect(syncedFileUrls.has(imageUrl)).toBe(true);
    });

    it('retries failed downloads of files referenced in document fields', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;
        const applicationModels = [
            {
                model: User,
                registration: true,
                files: [{ strategy: 'document' as const, fields: ['friendUrls'], availableOffline: true }],
            },
        ];

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
        ];

        FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respond(
            documentUrl,
            `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Alice" ;
                <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
        );
        FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 500));

        await Sync.run({ ...config, applicationModels });

        typeIndex.relatedRegistrations.related = [];

        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        // Act
        await Sync.run({ ...config, applicationModels });

        // Assert
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('pushes local files referenced in document fields', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imagesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const imageUrl = `${imagesContainerUrl}avatar.png`;

        FakeServer.respondOnce(imageUrl, FakeResponse.created());

        await localEngine.createDocument(
            documentUrl,
            turtleToQuadsSync(
                `<#it> a <http://xmlns.com/foaf/0.1/Person> ;
                    <http://xmlns.com/foaf/0.1/name> "Alice" ;
                    <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .`,
                { baseIRI: documentUrl },
            ),
        );
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                { model: User, registration: false, files: [{ strategy: 'document', fields: ['friendUrls'] }] },
            ],
        });

        // Assert
        expect(FakeServer.getRequest('PUT', imageUrl)).not.toBeNull();
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
    });

    it('downloads offline files referenced by documents merged while pushing', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const uploadUrl = `${containerUrl}upload.png`;
        const imageUrl = `${fakeContainerUrl({ baseUrl: storageUrl })}avatar.png`;

        FakeServer.respond(
            documentUrl,
            `
                ${fixture('person.ttl', { documentUrl })}

                <#it> <http://xmlns.com/foaf/0.1/knows> <${imageUrl}> .

                <#operation-4>
                    a <https://vocab.noeldemartin.com/crdt/AddPropertyOperation> ;
                    <https://vocab.noeldemartin.com/crdt/resource> <#it> ;
                    <https://vocab.noeldemartin.com/crdt/property> <http://xmlns.com/foaf/0.1/knows> ;
                    <https://vocab.noeldemartin.com/crdt/value> <${imageUrl}> ;
                    <https://vocab.noeldemartin.com/crdt/date>
                        "2021-01-04T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            `,
        );
        FakeServer.respondOnce(imageUrl, new Response('image', { headers: { 'Content-Type': 'image/png' } }));

        await createUnsyncedDocument(
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl }))),
        );
        await localEngine.writeFile(uploadUrl, new Blob(['upload']), {
            localChanges: fileLocalChanges(uploadUrl, 'created'),
        });

        // Act
        await Sync.run({
            ...config,
            applicationModels: [
                {
                    model: User,
                    registration: false,
                    files: [{ strategy: 'document', fields: ['friendUrls'], availableOffline: true }],
                },
            ],
        });

        // Assert
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    it('ignores local files without files config', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const imageUrl = `${containerUrl}image.png`;

        await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        await localEngine.writeFile(imageUrl, new Blob(['image'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(imageUrl, 'created'),
        });

        // Act
        await Sync.run({ ...config, applicationModels: [{ model: User, registration: false }] });

        // Assert
        expect(FakeServer.getRequests(imageUrl)).toHaveLength(0);
        expect(await localEngine.getDocumentLocalChanges(imageUrl)).not.toBeNull();
        expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('image');
    });

    describe('file conflicts', () => {
        const syncedAt = new Date('2026-11-17T07:00:00Z');
        const remoteModifiedAt = new Date('2026-11-17T08:00:00Z');
        let containerUrl: string;
        let documentUrl: string;
        let imageUrl: string;

        function respondContainer(files: Record<string, Date>): void {
            FakeServer.respond(
                containerUrl,
                `
                    ${containerTurtle({
                        [documentUrl]: { lastModifiedAt: new Date() },
                        ...Object.fromEntries(
                            Object.entries(files).map(([url, date]) => [url, { lastModifiedAt: date }]),
                        ),
                    })}
                    ${Object.keys(files)
                        .map((url) => `<${url}> a <http://www.w3.org/ns/iana/media-types/image/png#Resource> .`)
                        .join('\n')}
                `,
            );
            FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));
        }

        beforeEach(() => {
            containerUrl = fakeContainerUrl({ baseUrl: config.userProfile.storageUrls[0] });
            documentUrl = fakeDocumentUrl({ containerUrl });
            imageUrl = `${containerUrl}image.png`;

            typeIndex.relatedRegistrations.related = [
                new TypeRegistration({ instanceContainer: containerUrl, forClass: [expandIRI('foaf:Person')] }),
            ];
        });

        it('keeps remote files modified remotely', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

            respondContainer({ [imageUrl]: remoteModifiedAt });

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.writeFile(imageUrl, new Blob(['local']), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            const file = await localEngine.getFile(imageUrl);

            expect(resolveFileConflict).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'modified-remotely',
                    url: imageUrl,
                    remoteUpdatedAt: remoteModifiedAt,
                }),
            );
            expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
            expect(file).toMatchObject({ mimeType: 'image/png', lastModifiedAt: remoteModifiedAt });
            expect(file?.blob).toBeUndefined();
        });

        it('keeps local files modified remotely', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-local' as const);

            respondContainer({ [imageUrl]: remoteModifiedAt });
            FakeServer.respondOnce(imageUrl, FakeResponse.success());

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.writeFile(imageUrl, new Blob(['local']), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
            expect(FakeServer.getRequest('PUT', imageUrl)?.headers).not.toHaveProperty('If-Unmodified-Since');
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        });

        it('detects files created remotely with the same url', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

            respondContainer({ [imageUrl]: remoteModifiedAt });

            await localEngine.writeFile(imageUrl, new Blob(['local'], { type: 'image/png' }), {
                localChanges: fileLocalChanges(imageUrl, 'created'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
            expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
            expect(await localEngine.getFile(imageUrl)).toMatchObject({ lastModifiedAt: remoteModifiedAt });
        });

        it('detects files deleted remotely', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

            respondContainer({});

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.writeFile(imageUrl, new Blob(['local']), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            expect(resolveFileConflict).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'deleted-remotely', url: imageUrl }),
            );
            expect(FakeServer.getRequest('PUT', imageUrl)).toBeNull();
            expect(await localEngine.getFile(imageUrl)).toBeNull();
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        });

        it('detects files deleted locally and modified remotely', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

            respondContainer({ [imageUrl]: remoteModifiedAt });

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.deleteFile(imageUrl, { localChanges: fileLocalChanges(imageUrl, 'deleted') });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            const file = await localEngine.getFile(imageUrl);

            expect(resolveFileConflict).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'deleted-locally', url: imageUrl }),
            );
            expect(FakeServer.getRequest('DELETE', imageUrl)).toBeNull();
            expect(file?.deleted).toBeFalsy();
            expect(file).toMatchObject({ lastModifiedAt: remoteModifiedAt });
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        });

        it('detects conflicts using conditional requests', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-local' as const);

            respondContainer({ [imageUrl]: syncedAt });
            FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 412));
            FakeServer.respondOnce(imageUrl, FakeResponse.success());

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.writeFile(imageUrl, new Blob(['local']), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true, files: [{ strategy: 'container' }] }],
                resolveFileConflict,
            });

            // Assert
            const [conditionalRequest, overwriteRequest] = FakeServer.getRequests(imageUrl);

            expect(conditionalRequest?.headers).toHaveProperty('If-Unmodified-Since', 'Tue, 17 Nov 2026 07:00:01 GMT');
            expect(resolveFileConflict).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'modified-remotely', url: imageUrl, remoteUpdatedAt: null }),
            );
            expect(overwriteRequest?.headers).not.toHaveProperty('If-Unmodified-Since');
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
        });

        it('downloads offline files kept remotely after conditional requests', async () => {
            // Arrange
            const resolveFileConflict = vi.fn(async () => 'keep-remote' as const);

            respondContainer({ [imageUrl]: syncedAt });
            FakeServer.respondOnce(imageUrl, new FakeResponse('', {}, 412));
            FakeServer.respondOnce(
                imageUrl,
                new Response(null, { headers: { 'Last-Modified': remoteModifiedAt.toUTCString() } }),
            );
            FakeServer.respondOnce(imageUrl, new Response('remote', { headers: { 'Content-Type': 'image/png' } }));

            await localEngine.updateFile(imageUrl, { mimeType: 'image/png', lastModifiedAt: syncedAt });
            await localEngine.writeFile(imageUrl, new Blob(['local']), {
                localChanges: fileLocalChanges(imageUrl, 'updated'),
            });

            // Act
            await Sync.run({
                ...config,
                applicationModels: [
                    { model: User, registration: true, files: [{ strategy: 'container', availableOffline: true }] },
                ],
                resolveFileConflict,
            });

            // Assert
            expect(resolveFileConflict).toHaveBeenCalledWith(expect.objectContaining({ type: 'modified-remotely' }));
            expect(await localEngine.getDocumentLocalChanges(imageUrl)).toBeNull();
            expect(await (await localEngine.readFile(imageUrl)).text()).toEqual('remote');
            expect(await localEngine.getFile(imageUrl)).toMatchObject({
                mimeType: 'image/png',
                lastModifiedAt: remoteModifiedAt,
            });
        });
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
        FakeServer.respond(documentUrl, fixture('person.ttl', { documentUrl }));
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
        expect(await localEngine.getFile(imageUrl)).toMatchObject({ url: imageUrl, containerUrl });
        expect(await localEngine.getFile(textUrl)).toMatchObject({ url: textUrl, containerUrl });
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

    describe('local changes', () => {
        let containerUrl: string;
        let documentUrl: string;

        const tombstoneTurtle = (resourceUrl: string, deletedAt: string) => `
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${resourceUrl}-tombstone>
                a crdt:Tombstone ;
                crdt:resource <${resourceUrl}> ;
                crdt:deletedAt "${deletedAt}"^^xsd:dateTime .
        `;

        async function syncMovies(): Promise<void> {
            await Sync.run({
                ...config,
                applicationModels: [
                    { model: Movie, registration: true },
                    { model: WatchAction, registration: false },
                ],
            });
        }

        async function createSyncedDocument(contents: string, options: { deleted?: string } = {}): Promise<void> {
            const deletedUrl = options.deleted;

            await localEngine.createDocument(documentUrl, turtleToQuadsSync(contents), {
                lastModifiedAt: new Date('2021-01-01T00:00:00.000Z'),
                localChanges: deletedUrl
                    ? () => ({ resources: { [deletedUrl]: { deletedAt: new Date() } } })
                    : undefined,
            });
        }

        beforeEach(() => {
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

            await createUnsyncedDocument(documentUrl, turtleToQuadsSync(fixture('movie.ttl', { documentUrl })));

            // Act
            await syncMovies();

            // Assert
            expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
            expect(FakeServer.fetch).toHaveBeenNthCalledWith(
                3,
                documentUrl,
                expect.objectContaining({ method: 'PATCH' }),
            );
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
                FakeResponse.success(fixture('movie.ttl', { documentUrl }), {
                    'Last-Modified': new Date('2021-06-01T00:00:00.000Z').toUTCString(),
                });

            FakeServer.respondOnce(containerUrl, containerTurtle([]));
            FakeServer.respondOnce(documentUrl, remoteDocument());
            FakeServer.respondOnce(documentUrl, remoteDocument());
            FakeServer.respondOnce(
                documentUrl,
                FakeResponse.success(undefined, { 'Last-Modified': mergedAt.toUTCString() }),
            );

            await createUnsyncedDocument(documentUrl, turtleToQuadsSync(fixture('movie-watched.ttl', { documentUrl })));

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

            await createUnsyncedDocument(documentUrl, turtleToQuadsSync(fixture('movie.ttl', { documentUrl })));

            // Act
            await syncMovies();

            // Assert
            const localChanges = await localEngine.getDocumentLocalChanges(documentUrl);

            expect(localChanges?.resources[`${documentUrl}#it`]).toEqual({ createdAt: expect.any(Date) });
        });

        it('pulls up to date documents with local changes', async () => {
            // Arrange
            const lastModifiedAt = new Date('2021-01-02T00:00:00.000Z');
            const remoteDocument = fixture('person-missing-second-name.ttl', { documentUrl });

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

            await localEngine.createDocument(documentUrl, turtleToQuadsSync(fixture('person.ttl', { documentUrl })), {
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
            expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-second-name.sparql'));
            expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
        });

        it('pushes local deletions as tombstones', async () => {
            // Arrange
            const remoteDocument = fixture('movie-watched.ttl', { documentUrl });

            FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, FakeResponse.success());

            await createSyncedDocument(fixture('movie.ttl', { documentUrl }), { deleted: `${documentUrl}#action` });

            // Act
            await syncMovies();

            // Assert
            const localDocument = await localEngine.readDocument(documentUrl, { includeEmptyDocuments: true });

            expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
            expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('remove-watch-action.sparql'));
            expect(localDocument.contains(`${documentUrl}#action`)).toBe(false);
            expect(localDocument.statements(undefined, 'rdf:type', 'crdt:Tombstone')).toHaveLength(0);
            expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
        });

        it('keeps empty documents after pushing tombstones', async () => {
            // Arrange
            const remoteDocument = fixture('watch-action.ttl', { documentUrl });

            FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, FakeResponse.success());

            await createSyncedDocument('', { deleted: `${documentUrl}#action` });

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

            await createSyncedDocument('', { deleted: `${documentUrl}#action` });

            // Act
            await syncMovies();

            // Assert
            expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
            expect(await localEngine.readDocumentIfExists(documentUrl, { includeEmptyDocuments: true })).toBeNull();
            expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
        });

        it('keeps local deletions when pushing tombstones fails', async () => {
            // Arrange
            const remoteDocument = fixture('movie-watched.ttl', { documentUrl });

            FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, FakeResponse.internalServerError());

            await createSyncedDocument(fixture('movie.ttl', { documentUrl }), { deleted: `${documentUrl}#action` });

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
                fixture('movie.ttl', { documentUrl }),
                tombstoneTurtle(`${documentUrl}#action`, '2022-01-01T00:00:00.000Z'),
            ].join('\n');

            FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
            FakeServer.respondOnce(documentUrl, remoteDocument);
            FakeServer.respondOnce(documentUrl, FakeResponse.success());

            await createSyncedDocument(fixture('movie-watched.ttl', { documentUrl }));

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

            await createSyncedDocument(fixture('movie.ttl', { documentUrl }), { deleted: `${documentUrl}#action` });

            // Act
            await syncMovies();

            // Assert
            expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
            expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(
                `INSERT DATA { ${fixture('movie.ttl')} }`,
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

            await createSyncedDocument('', { deleted: `${documentUrl}#action` });

            // Act
            await syncMovies();

            // Assert
            const localDocument = await localEngine.readDocument(documentUrl);

            expect(localDocument.contains(actionUrl)).toBe(true);
            expect((await localEngine.getDocumentLocalChanges(documentUrl))?.resources[actionUrl]).toEqual({
                createdAt: expect.any(Date),
            });
        });

        describe('deletion conflicts', () => {
            class CascadingMovie extends defineSchema(Movie, {
                relations: {
                    actions: hasMany('WatchAction', 'objectUrl').usingSameDocument().onDelete('cascade'),
                },
            }) {}

            bootModels({ CascadingMovie });

            const movieUrl = () => `${documentUrl}#it`;
            const actionUrl = () => `${documentUrl}#action`;
            const remoteDocument = (contents: string, lastModifiedAt: string) =>
                FakeResponse.success(contents, { 'Last-Modified': new Date(lastModifiedAt).toUTCString() });
            const operationTurtle = (resourceUrl: string, name: string, date: string) => `
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

            async function syncCascadingMovies(
                resolveDeletionConflict?: SyncConfig['resolveDeletionConflict'],
            ): Promise<void> {
                await Sync.run({
                    ...config,
                    applicationModels: [
                        { model: CascadingMovie, registration: true },
                        { model: WatchAction, registration: false },
                    ],
                    resolveDeletionConflict,
                });
            }

            async function createLocalDocument(
                contents: string,
                resources: Record<string, ResourceLocalChanges>,
            ): Promise<void> {
                await localEngine.createDocument(documentUrl, turtleToQuadsSync(contents), {
                    lastModifiedAt: new Date('2021-01-01T00:00:00.000Z'),
                    localChanges: () => ({ resources }),
                });
            }

            it('deletes local changes on resources deleted remotely', async () => {
                // Arrange
                const resolveDeletionConflict = vi.fn(async () => 'delete' as const);

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(
                    documentUrl,
                    remoteDocument(tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z'), '2021-06-01'),
                );

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
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
                expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
                expect(localDocument.getQuads()).toHaveLength(0);
                expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
            });

            it('restores resources deleted remotely', async () => {
                // Arrange
                const tombstone = tombstoneTurtle(movieUrl(), '2021-06-01T00:00:00.000Z');

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(tombstone, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(tombstone, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
                    [actionUrl()]: { createdAt: new Date() },
                });

                // Act
                await syncCascadingMovies(async () => 'restore');

                // Assert
                const localDocument = await localEngine.readDocument(documentUrl);

                expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
                expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
                    DELETE DATA { ${tombstoneTurtle('#it', '2021-06-01T00:00:00.000Z')} } ;
                    INSERT DATA { ${fixture('movie-watched.ttl')} }
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

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {});

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
                const remoteContents = fixture('movie-watched.ttl', { documentUrl });

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument('', { [movieUrl()]: { deletedAt: new Date() } });

                // Act
                await syncCascadingMovies(resolveDeletionConflict);

                // Assert
                expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
                expect(resolveDeletionConflict).toHaveBeenCalledWith(
                    expect.objectContaining({ type: 'deleted-locally', resourceUrl: movieUrl() }),
                );
                expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
                expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
                    DELETE DATA { ${fixture('movie-watched.ttl')} } ;
                    INSERT DATA {
                        ${tombstoneTurtle('#it', '2022-01-01T00:00:00.000Z')}
                        ${tombstoneTurtle('#action', '2022-01-01T00:00:00.000Z')}
                    }
                `);
                expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
            });

            it('asks about resources deleted locally with unseen remote operations', async () => {
                // Arrange
                const resolveDeletionConflict = vi.fn(async () => 'delete' as const);
                const remoteContents = [
                    fixture('movie.ttl', { documentUrl }),
                    operationTurtle(movieUrl(), 'Original', '2021-01-01T00:00:00.000Z'),
                    operationTurtle(movieUrl(), 'Updated', '2021-06-01T00:00:00.000Z'),
                ].join('\n');

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument('', {
                    [movieUrl()]: { deletedAt: new Date(), deletedOperations: [`${movieUrl()}-operation-Original`] },
                });

                // Act
                await syncCascadingMovies(resolveDeletionConflict);

                // Assert
                expect(resolveDeletionConflict).toHaveBeenCalledTimes(1);
                expect(resolveDeletionConflict).toHaveBeenCalledWith(
                    expect.objectContaining({ type: 'deleted-locally', resourceUrl: movieUrl() }),
                );
            });

            it('deletes resources deleted locally without unseen remote operations', async () => {
                // Arrange
                const resolveDeletionConflict = vi.fn(async () => 'restore' as const);
                const remoteContents = [
                    fixture('movie.ttl', { documentUrl }),
                    operationTurtle(movieUrl(), 'Original', '2021-01-01T00:00:00.000Z'),
                ].join('\n');

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument('', {
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
                const remoteContents = [fixture('movie.ttl', { documentUrl }), commentTurtle('Updated')].join('\n');

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument(commentTurtle('Original'), { [movieUrl()]: { deletedAt: new Date() } });

                // Act
                await syncCascadingMovies(resolveDeletionConflict);

                // Assert
                expect(resolveDeletionConflict).not.toHaveBeenCalled();
                expect(await localEngine.getDocumentLocalChanges(documentUrl)).toBeNull();
            });

            it('restores resources deleted locally', async () => {
                // Arrange
                const remoteContents = [
                    fixture('movie-watched.ttl', { documentUrl }),
                    operationTurtle(movieUrl(), 'Updated', '2021-06-01T00:00:00.000Z'),
                ].join('\n');

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-06-01'));

                await createLocalDocument('', {
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
                const remoteContents = fixture('movie-watched.ttl', { documentUrl });

                FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-01-01'));
                FakeServer.respondOnce(documentUrl, remoteDocument(remoteContents, '2021-01-01'));
                FakeServer.respondOnce(documentUrl, FakeResponse.success());

                await createLocalDocument('', {
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

            describe('across documents', () => {
                class Franchise extends defineSchema({
                    rdfContext: 'https://schema.org/',
                    rdfClass: 'MovieSeries',
                    fields: {
                        name: string(),
                        movieUrls: array(url()).rdfProperty('hasPart').default([]),
                    },
                    relations: {
                        movies: belongsToMany('Movie', 'movieUrls').onDelete('cascade'),
                    },
                }) {}

                bootModels({ Franchise });

                const franchiseDocumentUrl = () => `${containerUrl}ghibli`;
                const franchiseUrl = () => `${franchiseDocumentUrl()}#it`;
                const franchiseTurtle = () => `
                    <${franchiseUrl()}>
                        a <https://schema.org/MovieSeries> ;
                        <https://schema.org/name> "Ghibli" ;
                        <https://schema.org/hasPart> <${movieUrl()}> .
                `;

                async function syncFranchises(
                    resolveDeletionConflict: SyncConfig['resolveDeletionConflict'],
                ): Promise<void> {
                    await Sync.run({
                        ...config,
                        applicationModels: [
                            { model: CascadingMovie, registration: true },
                            { model: Franchise, registration: false },
                            { model: WatchAction, registration: false },
                        ],
                        resolveDeletionConflict,
                    });
                }

                async function createLocalFranchiseDocument(
                    contents: string,
                    resources: Record<string, ResourceLocalChanges>,
                ): Promise<void> {
                    await localEngine.createDocument(franchiseDocumentUrl(), turtleToQuadsSync(contents), {
                        lastModifiedAt: new Date('2021-01-01T00:00:00.000Z'),
                        localChanges: () => ({ resources }),
                    });
                }

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

                    await createLocalFranchiseDocument(franchiseTurtle(), {});
                    await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
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

                    await createLocalFranchiseDocument(franchiseTurtle(), {});
                    await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
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
                    const remoteMovie = fixture('movie-watched.ttl', { documentUrl });

                    FakeServer.respondOnce(containerUrl, containerTurtle([franchiseDocumentUrl(), documentUrl]));
                    FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTurtle(), '2021-01-01'));
                    FakeServer.respondOnce(franchiseDocumentUrl(), remoteDocument(franchiseTurtle(), '2021-01-01'));
                    FakeServer.respondOnce(franchiseDocumentUrl(), FakeResponse.success());
                    FakeServer.respondOnce(documentUrl, remoteDocument(remoteMovie, '2021-06-01'));
                    FakeServer.respondOnce(documentUrl, remoteDocument(remoteMovie, '2021-06-01'));
                    FakeServer.respondOnce(documentUrl, FakeResponse.success());

                    await createLocalFranchiseDocument('', { [franchiseUrl()]: { deletedAt: new Date() } });
                    await createLocalDocument('', { [movieUrl()]: { deletedAt: new Date() } });

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
            });

            describe('restored children', () => {
                class RatedMovie extends defineSchema(Movie, {
                    history: true,
                    fields: { ratingUrl: url().rdfProperty('aggregateRating').optional() },
                    relations: {
                        rating: belongsToOne('Rating', 'ratingUrl').usingSameDocument().onDelete('cascade'),
                    },
                }) {}

                bootModels({ RatedMovie });

                const ratingUrl = () => `${documentUrl}#rating`;
                const movieTurtle = (options: { rated: boolean }) => `
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
                const ratingTurtle = () => `
                    @prefix schema: <https://schema.org/> .

                    <${ratingUrl()}> a schema:Rating ; schema:ratingValue 4 .
                `;

                async function syncRatedMovies(): Promise<void> {
                    await Sync.run({
                        ...config,
                        applicationModels: [
                            { model: RatedMovie, registration: true },
                            { model: Rating, registration: false },
                        ],
                        resolveDeletionConflict: async () => 'restore',
                    });
                }

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

                    await createLocalDocument([movieTurtle({ rated: true }), ratingTurtle()].join('\n'), {
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

                    await createLocalDocument(movieTurtle({ rated: false }), {
                        [ratingUrl()]: { deletedAt: new Date() },
                    });

                    // Act
                    await syncRatedMovies();

                    // Assert
                    const localDocument = await localEngine.readDocument(documentUrl);

                    expect(localDocument.contains(ratingUrl())).toBe(true);
                    expect(localDocument.contains(movieUrl(), 'schema:aggregateRating', ratingUrl())).toBe(true);
                    expect(
                        localDocument.statements(undefined, 'rdf:type', 'crdt:SetPropertyOperation'),
                    ).not.toHaveLength(0);
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

                    await createLocalDocument([movieTurtle({ rated: true }), ratingTurtle()].join('\n'), {
                        [ratingUrl()]: { updatedAt: new Date() },
                    });

                    // Act
                    await Sync.run({
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
                        [
                            new DeleteResourceOperation(actionUrl()),
                            new DeleteResourceOperation(`${actionUrl()}-metadata`),
                        ],
                        { localChanges: () => null },
                    );

                    return FakeResponse.notFound();
                });

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
                    [actionUrl()]: { createdAt: new Date() },
                });

                // Act
                await Sync.run({
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
                const job = new Sync({
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

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
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
                const job: Sync = new Sync({
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

                await createLocalDocument(fixture('movie-watched.ttl', { documentUrl }), {
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
        });
    });

    describe('external sources', () => {
        const otherStorageUrl = 'https://other-pod.com/';

        it('pulls external containers and instances without registering them', async () => {
            // Arrange
            const containerUrl = `${otherStorageUrl}movies/`;
            const documentUrl = `${containerUrl}the-substance`;
            const instanceUrl = `${otherStorageUrl}people/alice#it`;
            const registeredModels: ModelConstructor[][] = [];

            FakeServer.respond(containerUrl, containerTurtle([documentUrl]));
            FakeServer.respond(documentUrl, fixture('movie.ttl', { documentUrl }));
            FakeServer.respond(urlRoute(instanceUrl), fixture('person.ttl', { documentUrl: urlRoute(instanceUrl) }));

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
                documentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('movie.ttl', { documentUrl }))),
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
                documentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl }))),
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

            FakeServer.respond(documentUrl, fixture('person-missing-second-name.ttl', { documentUrl }));

            await createUnsyncedDocument(
                documentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl }))),
            );

            // Act
            await Sync.run({
                ...config,
                applicationModels: [{ model: User, registration: true }],
                externalSources: [{ instanceUrl, models: [User] }],
            });

            // Assert
            expect(FakeServer.getRequests('PATCH', documentUrl)).toHaveLength(1);
            expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(fixture('add-second-name.sparql'));
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
            FakeServer.respond(workingDocumentUrl, fixture('movie.ttl', { documentUrl: workingDocumentUrl }));

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
            FakeServer.respond(ownDocumentUrl, fixture('movie.ttl', { documentUrl: ownDocumentUrl }));
            FakeServer.respond(forbiddenContainerUrl, new Response(null, { status: 403 }));
            FakeServer.respond(brokenContainerUrl, FakeResponse.internalServerError());
            FakeServer.respond(workingContainerUrl, containerTurtle([workingDocumentUrl]));
            FakeServer.respond(workingDocumentUrl, fixture('movie.ttl', { documentUrl: workingDocumentUrl }));

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

    describe('type index registration', () => {
        let containerUrl: string;
        let documentUrl: string;
        let publicTypeIndex: TypeIndex;
        let privateTypeIndex: TypeIndex;
        let registeredModels: [TypeIndex, ModelConstructor[], ModelRegistrationMode][];

        beforeEach(async () => {
            const storageUrl = config.userProfile.storageUrls[0];

            containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
            documentUrl = fakeDocumentUrl({ containerUrl });
            publicTypeIndex = fakeTypeIndex(`${storageUrl}settings/publicTypeIndex`);
            privateTypeIndex = fakeTypeIndex(`${storageUrl}settings/privateTypeIndex`);
            registeredModels = [];

            FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
            FakeServer.respondOnce(documentUrl, FakeResponse.success());

            await createUnsyncedDocument(
                documentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl }))),
            );
        });

        function respondWithContainerACL(): void {
            FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
            FakeServer.respondWith(`${containerUrl}.acl`, (request) =>
                request.method === 'GET'
                    ? FakeResponse.success(`
                        @prefix acl: <http://www.w3.org/ns/auth/acl#>.

                        <#owner>
                            a acl:Authorization;
                            acl:agent <${userProfile.webId}>;
                            acl:accessTo <./>;
                            acl:default <./>;
                            acl:mode acl:Read, acl:Write, acl:Control.
                    `)
                    : FakeResponse.success(),
            );
        }

        const onModelsRegistered = ({ typeIndex, models, mode }: ModelsRegisteredEvent) => {
            registeredModels.push([typeIndex, models, mode]);
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
            expect(registeredModels[0]?.[2]).toEqual('container');
            expect(FakeServer.getRequests(publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', privateTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-container.sparql', { containerUrl }),
            );
        });

        it('registers public models in the public type index', async () => {
            // Arrange
            respondWithContainerACL();

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
            expect(FakeServer.getRequest('PATCH', `${containerUrl}.acl`)?.body).toEqualSparql(`
                INSERT DATA {
                    @prefix acl: <http://www.w3.org/ns/auth/acl#>.
                    @prefix foaf: <http://xmlns.com/foaf/0.1/>.

                    <#public>
                        a acl:Authorization;
                        acl:agentClass foaf:Agent;
                        acl:accessTo <${containerUrl}>;
                        acl:default <${containerUrl}>;
                        acl:mode acl:Read.
                }
            `);
        });

        it('does not register public models when containers cannot be made public', async () => {
            // Arrange
            const failedModels: ModelConstructor[] = [];

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { public: true } }],
                onModelsRegistered,
                onModelsRegistrationFailed: ({ models }) => failedModels.push(...models),
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(failedModels).toEqual([User]);
            expect(FakeServer.getRequests('PATCH', publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
        });

        it('registers models with instance mode as instances', async () => {
            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { mode: 'instance' } }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[0]).toBe(privateTypeIndex);
            expect(registeredModels[0]?.[1]).toEqual([User]);
            expect(registeredModels[0]?.[2]).toEqual('instance');
            expect(FakeServer.getRequest('PATCH', privateTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
            );
        });

        it('does not register public instances when documents cannot be made public', async () => {
            // Arrange
            const failedModels: ModelConstructor[] = [];

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { public: true, mode: 'instance' } }],
                onModelsRegistered,
                onModelsRegistrationFailed: ({ models }) => failedModels.push(...models),
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(failedModels).toEqual([User]);
            expect(FakeServer.getRequests('PATCH', publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
        });

        it('registers new instances when other instances are registered', async () => {
            // Arrange
            const instanceUrl = fakeDocumentUrl({ baseUrl: config.userProfile.storageUrls[0] });

            publicTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instance: `${instanceUrl}#it` }),
            ];

            FakeServer.respond(instanceUrl, fixture('person.ttl', { documentUrl: instanceUrl }));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { mode: 'instance' } }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(1);
            expect(registeredModels[0]?.[1]).toEqual([User]);
            expect(FakeServer.getRequests('PATCH', privateTypeIndex.requireUrl())).toHaveLength(1);
            expect(FakeServer.getRequest('PATCH', privateTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
            );
            expect(FakeServer.getRequest('GET', instanceUrl)).not.toBeNull();
            expect(await localEngine.readDocumentIfExists(instanceUrl)).not.toBeNull();
        });

        it('registers every instance', async () => {
            // Arrange
            const otherDocumentUrl = fakeDocumentUrl({ containerUrl });

            FakeServer.respondOnce(otherDocumentUrl, FakeResponse.notFound());
            FakeServer.respondOnce(otherDocumentUrl, FakeResponse.success());

            await createUnsyncedDocument(
                otherDocumentUrl,
                await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl: otherDocumentUrl }))),
            );

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { mode: 'instance' } }],
                onModelsRegistered,
            });

            // Assert
            const registeredInstances = privateTypeIndex.registrations?.map((registration) => registration.instance);

            expect(registeredModels).toEqual([[privateTypeIndex, [User], 'instance']]);
            expect(FakeServer.getRequests('PATCH', privateTypeIndex.requireUrl())).toHaveLength(2);
            expect(registeredInstances).toHaveLength(2);
            expect(registeredInstances).toContain(`${documentUrl}#it`);
            expect(registeredInstances).toContain(`${otherDocumentUrl}#it`);
        });

        it('uses container mode for instance-mode models when their container is registered', async () => {
            // Arrange
            privateTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instanceContainer: containerUrl }),
            ];

            FakeServer.respond(containerUrl, containerTurtle([]));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { mode: 'instance' } }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(FakeServer.getRequests(publicTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
            expect(FakeServer.getRequest('PATCH', documentUrl)).not.toBeNull();
        });

        it('registers models with container mode as instances when instances are registered', async () => {
            // Arrange
            const instanceUrl = fakeDocumentUrl({ baseUrl: config.userProfile.storageUrls[0] });

            publicTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instance: `${instanceUrl}#it` }),
            ];

            FakeServer.respond(instanceUrl, fixture('person.ttl', { documentUrl: instanceUrl }));

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: true }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toEqual([[privateTypeIndex, [User], 'instance']]);
            expect(FakeServer.getRequests('PATCH', privateTypeIndex.requireUrl())).toHaveLength(1);
            expect(FakeServer.getRequest('PATCH', privateTypeIndex.requireUrl())?.body).toEqualSparql(
                fixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
            );
            expect(await localEngine.readDocumentIfExists(instanceUrl)).not.toBeNull();
        });

        it('skips registered instances', async () => {
            // Arrange
            privateTypeIndex.relatedRegistrations.related = [
                new TypeRegistration({ forClass: [expandIRI('foaf:Person')], instance: `${documentUrl}#it` }),
            ];

            // Act
            await Sync.run({
                ...config,
                publicTypeIndexes: [publicTypeIndex],
                privateTypeIndexes: [privateTypeIndex],
                applicationModels: [{ model: User, registration: { mode: 'instance' } }],
                onModelsRegistered,
            });

            // Assert
            expect(registeredModels).toHaveLength(0);
            expect(FakeServer.getRequests(privateTypeIndex.requireUrl())).toHaveLength(0);
        });

        it('creates missing public type indexes', async () => {
            // Arrange
            respondWithContainerACL();

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
            await createUnsyncedDocument(
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

            await createUnsyncedDocument(
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
                onModelsRegistrationFailed: ({ models, error: registrationError }) => {
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
            const restoredLocalChanges = await localEngine.getDocumentsLocalChanges();
            const restoredStates = Object.values(restoredLocalChanges).flatMap((changes) =>
                Object.values(changes.resources).map((resourceChanges) =>
                    resourceChanges.deletedAt ? 'deleted' : resourceChanges.createdAt ? 'created' : 'updated',
                ),
            );

            expect(Object.keys(restoredLocalChanges)).toEqual(expect.arrayContaining([documentUrl, nestedDocumentUrl]));
            expect(new Set(restoredStates)).toEqual(new Set(['updated']));

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
            expect(await localEngine.getDocumentsLastModifiedAt()).toEqual(
                expect.objectContaining({ [documentUrl]: expect.any(Date), [nestedDocumentUrl]: expect.any(Date) }),
            );
            expect(await localEngine.getDocumentsLocalChanges()).toEqual({});
        });
    });
});
