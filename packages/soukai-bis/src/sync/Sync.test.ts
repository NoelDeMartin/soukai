import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Person from 'soukai-bis/testing/stubs/Person';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import type { ModelConstructor } from 'soukai-bis/models/types';

import Sync from './Sync';
import type { SyncConfig } from './Sync';

const fixture = <T = string>(name: string, replacements: Record<string, string> = {}) =>
    loadFixture<T>(new URL(`./Sync.test.ts-fixtures/${name}`, import.meta.url), replacements);

describe('Sync', () => {

    let localEngine: InMemoryEngine;
    let remoteEngine: SolidEngine;
    let typeIndex: TypeIndex;
    let config: Pick<SyncConfig, 'userProfile' | 'localEngine' | 'remoteEngine' | 'typeIndexes'>;

    const userProfile = {
        webId: 'https://myprofile.com/profile#me',
        storageUrls: ['https://my-pod.com/'],
        cloaked: false,
        writableProfileUrl: 'https://myprofile.com/profile',
    } satisfies SolidUserProfile;

    beforeEach(() => {
        localEngine = new InMemoryEngine();
        remoteEngine = new SolidEngine(FakeServer.fetch);
        typeIndex = new TypeIndex();
        config = {
            userProfile,
            localEngine,
            remoteEngine,
            typeIndexes: [typeIndex],
        };

        TypeIndex.setEngine(remoteEngine);
        TypeRegistration.setEngine(remoteEngine);
    });

    it('uses type indexes', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const personContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const firstMoviesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const secondMoviesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const postsContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Person')],
                instanceContainer: personContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('foaf:Person')],
                instanceContainer: personContainerUrl,
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
                { model: Person, registered: true },
                { model: Movie, registered: true },
            ],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenCalledWith(personContainerUrl, expect.anything());
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
            applicationModels: [{ model: Person, registered: true }],
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
            applicationModels: [{ model: Person, registered: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        await expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-second-name.sparql'));
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
            applicationModels: [{ model: Person, registered: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        await expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-third-name.sparql'));
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
            applicationModels: [{ model: Person, registered: true }],
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
        await expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('add-third-name.sparql'));
    });

    it('handles missing remote documents', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const typeIndexUrl = `${storageUrl}settings/privateTypeIndex`;
        const registeredModels: ModelConstructor[] = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, fixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, fixture('type-index.ttl'));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());
        FakeServer.respondOnce(userProfile.writableProfileUrl, FakeResponse.success());

        await localEngine.createDocument(documentUrl, localDocument);

        // Act
        await Sync.run({
            ...config,
            typeIndexes: [],
            applicationModels: [{ model: Person, registered: true }],
            onModelsRegistered(_, models) {
                registeredModels.push(...models);
            },
        });

        // Assert
        expect(registeredModels).toEqual([Person]);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(8);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA { ${fixture('person.ttl')} }
        `);

        await expect(FakeServer.fetchSpy.mock.calls[7]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass foaf:Person;
                    solid:instanceContainer <${containerUrl}> .
            }
        `);
    });

    it('handles missing local documents', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                instanceContainer: containerUrl,
                forClass: [expandIRI('foaf:Person')],
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(documentUrl, fixture('person.ttl'));

        // Act
        await Sync.run({
            ...config,
            applicationModels: [{ model: Person, registered: true }],
        });

        // Assert
        const updatedLocalDocument = await localEngine.readDocument(documentUrl);
        const expectedLocalDocument = await quadsToJsonLD(turtleToQuadsSync(fixture('person.ttl', { documentUrl })));
        const actualLocalDocument = await quadsToJsonLD(updatedLocalDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());

        await expect(actualLocalDocument).toEqualJsonLD(expectedLocalDocument);
    });

});
