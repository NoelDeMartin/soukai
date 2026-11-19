import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import TypeIndex from './TypeIndex';

describe('TypeIndex public', () => {
    const typeIndexUrl = 'https://alice.example/settings/publicTypeIndex';

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
            writableProfileUrl: 'https://alice.example/profile/card',
        };

        FakeServer.respond(user.writableProfileUrl as string, FakeResponse.success());
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.notFound());
    });

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
        expect(typeIndex.isPublicRegistration()).toBe(true);
        expect(typeIndex.isPrivateRegistration()).toBe(false);
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

    function respondWithTypeIndex(aclLink: string): void {
        FakeServer.respondWith(typeIndexUrl, (request) => {
            if (request.method === 'GET') {
                return FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');
            }

            return FakeResponse.success(undefined, {
                Link: aclLink,
                'WAC-Allow':
                    FakeServer.getRequests('PATCH', `${typeIndexUrl}.acl`).length > 0 ? 'public="read"' : 'public=""',
            });
        });
    }
});
