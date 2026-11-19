import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import TypeIndex from './TypeIndex';

describe('TypeIndex private', () => {
    const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
    const profileUrl = 'https://alice.example/profile/card';

    let user: CompleteSolidUserProfile;

    useSolidEngine();

    beforeEach(() => {
        user = {
            webId: 'https://alice.example/profile/card#me',
            shallow: false,
            cloakedDocumentUrls: [],
            publicTypeIndexUrls: [],
            privateTypeIndexUrls: [],
            storageUrls: ['https://alice.example/'],
            writableProfileUrl: profileUrl,
        };

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );
    });

    it('creates private type indexes with a new preferences file', async () => {
        // Arrange
        const preferencesFileUrl = 'https://alice.example/settings/preferences';

        FakeServer.respondWith(preferencesFileUrl, (request) =>
            request.method === 'GET' ? FakeResponse.notFound() : FakeResponse.success(),
        );
        FakeServer.respond(profileUrl, FakeResponse.success());

        // Act
        const typeIndex = await TypeIndex.createPrivate(user);

        // Assert
        expect(typeIndex.url).toEqual(typeIndexUrl);
        expect(typeIndex.isPublicRegistration()).toBe(false);
        expect(typeIndex.isPrivateRegistration()).toBe(true);
        expect(user.privateTypeIndexUrls).toEqual([typeIndexUrl]);
        expect(user.preferencesFileUrl).toEqual(preferencesFileUrl);
        expect(FakeServer.getRequest('PATCH', profileUrl)?.body).toEqualSparql(`
            INSERT DATA { <#me> <http://www.w3.org/ns/pim/space#preferencesFile> <${preferencesFileUrl}> . }
        `);
        expect(FakeServer.getRequest('PUT', typeIndexUrl)?.body).toEqualTurtle(`
            <> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .
        `);
        expect(FakeServer.getRequest('PATCH', preferencesFileUrl)?.body).toEqualSparql(`
            INSERT DATA {
                <${user.webId}> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndexUrl}> .
            }
        `);
    });

    it('creates private type indexes in existing preferences files', async () => {
        // Arrange
        const preferencesFileUrl = 'https://alice.example/settings/prefs.ttl';

        user.preferencesFileUrl = preferencesFileUrl;
        user.cloakedDocumentUrls = ['https://alice.example/profile/extended'];

        FakeServer.respond(preferencesFileUrl, FakeResponse.success());

        // Act
        await TypeIndex.createPrivate(user);

        // Assert
        expect(FakeServer.getRequests('PATCH', profileUrl)).toHaveLength(0);
        expect(FakeServer.getRequest('PATCH', preferencesFileUrl)?.body).toEqualSparql(`
            INSERT DATA {
                <${user.webId}> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndexUrl}> .
            }
        `);
    });
});
