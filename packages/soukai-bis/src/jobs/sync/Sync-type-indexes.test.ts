import { expandIRI, quadsToJsonLD, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';
import User from 'soukai-bis/testing/stubs/User';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import Sync from './Sync';
import type { ModelRegistrationMode, ModelsRegisteredEvent } from './Sync';
import { createUnsyncedDocument, fakeTypeIndex, setupSyncTest, syncFixture } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('Sync type indexes', () => {
    let localEngine: InMemoryEngine;
    let config: SyncTestContext['config'];
    let containerUrl: string;
    let documentUrl: string;
    let publicTypeIndex: TypeIndex;
    let privateTypeIndex: TypeIndex;
    let registeredModels: [TypeIndex, ModelConstructor[], ModelRegistrationMode][];

    beforeEach(async () => {
        ({ localEngine, config } = setupSyncTest());

        const storageUrl = config.userProfile.storageUrls[0];

        containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        documentUrl = fakeDocumentUrl({ containerUrl });
        publicTypeIndex = fakeTypeIndex(`${storageUrl}settings/publicTypeIndex`);
        privateTypeIndex = fakeTypeIndex(`${storageUrl}settings/privateTypeIndex`);
        registeredModels = [];

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        await createUnsyncedDocument(
            localEngine,
            documentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl }))),
        );
    });

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
            syncFixture('register-container.sparql', { containerUrl }),
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
            syncFixture('register-container.sparql', { containerUrl }),
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
            syncFixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
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

        FakeServer.respond(instanceUrl, syncFixture('person.ttl', { documentUrl: instanceUrl }));

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
            syncFixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
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
            localEngine,
            otherDocumentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl: otherDocumentUrl }))),
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

        FakeServer.respond(instanceUrl, syncFixture('person.ttl', { documentUrl: instanceUrl }));

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
            syncFixture('register-instance.sparql', { instanceUrl: `${documentUrl}#it` }),
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
            localEngine,
            documentUrl,
            await quadsToJsonLD(
                turtleToQuadsSync(
                    syncFixture('person.ttl', { documentUrl }).replace('a foaf:Person', 'a foaf:Person, foaf:Agent'),
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
            localEngine,
            nestedDocumentUrl,
            await quadsToJsonLD(turtleToQuadsSync(syncFixture('person.ttl', { documentUrl: nestedDocumentUrl }))),
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
        FakeServer.respondOnce(documentUrl, syncFixture('person.ttl', { documentUrl }));
        FakeServer.respondOnce(nestedDocumentUrl, syncFixture('person.ttl', { documentUrl: nestedDocumentUrl }));

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

    function respondWithContainerACL(): void {
        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
        FakeServer.respondWith(`${containerUrl}.acl`, (request) =>
            request.method === 'GET'
                ? FakeResponse.success(`
                    @prefix acl: <http://www.w3.org/ns/auth/acl#>.

                    <#owner>
                        a acl:Authorization;
                        acl:agent <${config.userProfile.webId}>;
                        acl:accessTo <./>;
                        acl:default <./>;
                        acl:mode acl:Read, acl:Write, acl:Control.
                `)
                : FakeResponse.success(),
        );
    }

    function onModelsRegistered({ typeIndex, models, mode }: ModelsRegisteredEvent): void {
        registeredModels.push([typeIndex, models, mode]);
    }
});
