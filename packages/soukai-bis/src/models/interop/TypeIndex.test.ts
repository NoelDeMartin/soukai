import { CloakedPreferencesFile } from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import Post from 'soukai-bis/testing/stubs/Post';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import TypeIndex from './TypeIndex';

describe('TypeIndex', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('finds containers registered with more classes', async () => {
        // Arrange
        const typeIndexUrl = fakeDocumentUrl();
        const containerUrl = fakeContainerUrl();

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/BlogPosting>, <https://schema.org/Article> ;
                    solid:instanceContainer <${containerUrl}> .
            `,
        );
        FakeServer.respondOnce(
            containerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .

                <> a ldp:Container .
            `,
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);
        const container = await typeIndex.findContainer(Post);

        // Assert
        expect(container?.url).toEqual(containerUrl);
    });

    describe('public type indexes', () => {
        const typeIndexUrl = 'https://alice.example/settings/publicTypeIndex';
        let user: CompleteSolidUserProfile;

        beforeEach(() => {
            user = {
                webId: 'https://alice.example/profile/card#me',
                shallow: false,
                cloakedDocumentUrls: [],
                publicTypeIndexUrls: [],
                privateTypeIndexUrls: [],
                storageUrls: ['https://alice.example/'],
                writableProfileUrl: 'https://alice.example/profile/card',
            };

            FakeServer.respond(user.writableProfileUrl as string, FakeResponse.success());
            FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
        });

        function respondWithTypeIndex(aclLink: string): void {
            FakeServer.respondWith(typeIndexUrl, (request) => {
                if (request.method === 'GET') {
                    return FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');
                }

                return FakeResponse.success(undefined, { Link: aclLink });
            });
        }

        it('creates public type indexes', async () => {
            // Arrange
            respondWithTypeIndex('<publicTypeIndex.acl>; rel="acl"');

            FakeServer.respondWith(`${typeIndexUrl}.acl`, (request) =>
                request.method === 'GET'
                    ? FakeResponse.success(`
                        @prefix acl: <http://www.w3.org/ns/auth/acl#>.

                        <#owner>
                            a acl:Authorization;
                            acl:agent <${user.webId}>;
                            acl:accessTo <./publicTypeIndex>;
                            acl:mode acl:Read, acl:Write, acl:Control.
                    `)
                    : FakeResponse.success(),
            );

            // Act
            const typeIndex = await TypeIndex.createPublic(user);

            // Assert
            expect(typeIndex.url).toEqual(typeIndexUrl);
            expect(typeIndex.isPublic()).toBe(true);
            expect(user.publicTypeIndexUrls).toEqual([typeIndexUrl]);
            expect(FakeServer.getRequest('PUT', typeIndexUrl)?.body).toEqualTurtle(`
                <> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#ListedDocument> .
            `);
            expect(FakeServer.getRequest('PATCH', user.writableProfileUrl as string)?.body).toEqualSparql(`
                INSERT DATA { <#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex> <${typeIndexUrl}> . }
            `);
            expect(FakeServer.getRequest('PATCH', `${typeIndexUrl}.acl`)?.body).toEqualSparql(`
                INSERT DATA {
                    <#public>
                        a <http://www.w3.org/ns/auth/acl#Authorization>;
                        <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;
                        <http://www.w3.org/ns/auth/acl#accessTo> <${typeIndexUrl}>;
                        <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>.
                }
            `);
        });

        it('creates public type indexes on ACP servers', async () => {
            // Arrange
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
                // Nothing to do here.
            });

            respondWithTypeIndex('<publicTypeIndex?ext=acr>; rel="acl"');

            FakeServer.respond(
                `${typeIndexUrl}?ext=acr`,
                FakeResponse.success(undefined, {
                    Link: '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"',
                }),
            );

            // Act
            const typeIndex = await TypeIndex.createPublic(user);

            // Assert
            expect(typeIndex.url).toEqual(typeIndexUrl);
            expect(user.publicTypeIndexUrls).toEqual([typeIndexUrl]);
            expect(warn).toHaveBeenCalledOnce();

            warn.mockRestore();
        });
    });

    describe('private type indexes', () => {
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const profileUrl = 'https://alice.example/profile/card';
        let user: CompleteSolidUserProfile;

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

        it('fails creating private type indexes when the preferences file is cloaked', async () => {
            // Arrange
            const preferencesFileUrl = 'https://alice.example/settings/prefs.ttl';

            user.preferencesFileUrl = preferencesFileUrl;
            user.cloakedDocumentUrls = [preferencesFileUrl];

            // Act
            const promisedTypeIndex = TypeIndex.createPrivate(user);

            // Assert
            await expect(promisedTypeIndex).rejects.toBeInstanceOf(CloakedPreferencesFile);
            await expect(promisedTypeIndex).rejects.toThrow(
                `Can't create private type index because the preferences file at ${preferencesFileUrl} could not be read`,
            );
            expect(FakeServer.getRequests()).toHaveLength(0);
        });
    });
});
