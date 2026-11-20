import { expandIRI, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { arrayUnique } from '@noeldemartin/utils';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type { ResourceLocalChanges } from 'soukai-bis/engines/LocalEngine';
import type { SyncJobConfig } from 'soukai-bis/jobs/sync/SyncJob';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { engine } from 'soukai-bis/testing/utils/engines';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';

export type SyncTestUserProfile = CompleteSolidUserProfile & { writableProfileUrl: string };

export interface SyncTestContext {
    localEngine: InMemoryEngine;
    typeIndex: TypeIndex;
    config: Pick<SyncJobConfig, 'privateTypeIndexes'> & { userProfile: SyncTestUserProfile };
}

export function setupSyncTest(): SyncTestContext {
    const typeIndex = new TypeIndex();

    return {
        localEngine: engine,
        typeIndex,
        config: {
            userProfile: fakeUserProfile(),
            privateTypeIndexes: [typeIndex],
        },
    };
}

export function fakeUserProfile(): SyncTestUserProfile {
    return {
        webId: 'https://myprofile.com/profile#me',
        storageUrls: ['https://my-pod.com/'],
        shallow: false,
        cloakedDocumentUrls: [],
        publicTypeIndexUrls: [],
        privateTypeIndexUrls: [],
        writableProfileUrl: 'https://myprofile.com/profile',
    };
}

export function syncFixture<T = string>(name: string, replacements: Record<string, string> = {}): T {
    return loadFixture<T>(new URL(`./fixtures/${name}`, import.meta.url), replacements);
}

export function fakeTypeIndex(url: string, registrations: TypeRegistration[] = []): TypeIndex {
    const typeIndex = new TypeIndex({ url }, { exists: true });

    typeIndex.relatedRegistrations.related = registrations;

    FakeServer.respond(url, FakeResponse.success());

    return typeIndex;
}

export async function createUnsyncedDocument(
    localEngine: InMemoryEngine,
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
            resources: Object.fromEntries(resourceUrls.map((resourceUrl) => [resourceUrl, { createdAt: new Date() }])),
        }),
    });
}

export async function createLocalDocument(
    localEngine: InMemoryEngine,
    url: string,
    contents: string,
    resources?: Record<string, ResourceLocalChanges>,
): Promise<void> {
    await localEngine.createDocument(url, turtleToQuadsSync(contents), {
        lastModifiedAt: new Date('2021-01-01T00:00:00.000Z'),
        localChanges: resources ? () => ({ resources }) : undefined,
    });
}

export function tombstoneTurtle(resourceUrl: string, deletedAt: string): string {
    return `
        @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        <${resourceUrl}-tombstone>
            a crdt:Tombstone ;
            crdt:resource <${resourceUrl}> ;
            crdt:deletedAt "${deletedAt}"^^xsd:dateTime .
    `;
}
