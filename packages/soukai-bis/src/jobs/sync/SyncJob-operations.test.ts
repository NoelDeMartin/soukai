import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import SyncJob from './SyncJob';
import { createUnsyncedDocument, setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('SyncJob operations', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());
    });

    it('syncs new operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('person-missing-second-name.ttl');
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));

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

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await SyncJob.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('add-second-name.sparql'));
    });

    it('syncs old operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('person-missing-third-name.ttl');
        const localDocument = await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })));

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

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await SyncJob.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('add-third-name.sparql'));
    });

    it('syncs remote and local operations', async () => {
        // Arrange
        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const remoteDocument = syncFixture('person-missing-third-name.ttl');
        const localDocument = await quadsToJsonLD(
            turtleToQuadsSync(syncFixture('person-missing-second-name.ttl', { documentUrl })),
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

        await createUnsyncedDocument(localEngine, documentUrl, localDocument);

        // Act
        await SyncJob.run({
            ...config,
            applicationModels: [{ model: User, registration: true }],
        });

        // Assert
        const updatedLocalDocument = await localEngine.readDocument(documentUrl);
        const expectedLocalDocument = await quadsToJsonLD(
            turtleToQuadsSync(syncFixture('person.ttl', { documentUrl })),
        );
        const actualLocalDocument = await quadsToJsonLD(updatedLocalDocument.getQuads());

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, expect.anything());
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, documentUrl, expect.anything());

        await expect(actualLocalDocument).toEqualJsonLD(expectedLocalDocument);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(syncFixture('add-third-name.sparql'));
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
            localEngine,
            documentUrl,
            turtleToQuadsSync(personTurtle(['bob', 'dave'], localOperation), { baseIRI: documentUrl }),
        );

        // Act
        await SyncJob.run({
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
            localEngine,
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
        await SyncJob.run({
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
            localEngine,
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
        await SyncJob.run({
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
            localEngine,
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
        await SyncJob.run({
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
});
