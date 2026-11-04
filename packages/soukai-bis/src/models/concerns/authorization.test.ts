import { SolidDocumentPermissions, Unauthorized } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { rememberAuthorizationProtocol } from './authorization';

describe('Authorization', () => {
    const rootUrl = 'https://alice.example/';
    const containerUrl = `${rootUrl}movies/`;
    const documentUrl = `${containerUrl}spirited-away`;
    const acpPrefixes = `
        @prefix acl: <http://www.w3.org/ns/auth/acl#>.
        @prefix acp: <http://www.w3.org/ns/solid/acp#>.
    `;
    const acrType = { Link: '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"' };

    function respondWithLinks(url: string, aclLink: string, headers: Record<string, string> = {}): void {
        FakeServer.respond(url, FakeResponse.success(undefined, { Link: `<${aclLink}>; rel="acl"`, ...headers }));
    }

    function respondWithACR(url: string, turtle: string | null): void {
        FakeServer.respond(
            url,
            turtle === null ? FakeResponse.notFound() : FakeResponse.success(`${acpPrefixes}\n${turtle}`, acrType),
        );
    }

    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('detects WAC and remembers it by origin', async () => {
        // Arrange
        const otherDocumentUrl = `${rootUrl}shows/spirited-away`;
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });
        const otherMovie = new Movie({ url: `${otherDocumentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acl', { 'WAC-Allow': 'user="read write", public="read"' });
        respondWithLinks(otherDocumentUrl, 'spirited-away.acl', { 'WAC-Allow': 'public=""' });
        FakeServer.respond(`${documentUrl}.acl`, '<#owner> a <http://www.w3.org/ns/auth/acl#Authorization> .');

        // Act
        const permissions = await movie.fetchPermissions();
        const detectionRequestsCount = FakeServer.getRequests().length;
        const otherPermissions = await otherMovie.fetchPermissions();

        // Assert
        expect(permissions).toEqual({ protocol: 'wac', publicPermissions: [SolidDocumentPermissions.Read] });
        expect(movie.usesWAC()).toBe(true);
        expect(movie.isPublic()).toBe(true);
        expect(otherPermissions).toEqual({ protocol: 'wac', publicPermissions: [] });
        expect(otherMovie.isPrivate()).toBe(true);
        expect(detectionRequestsCount).toEqual(2);
        expect(FakeServer.getRequests()).toHaveLength(3);
        expect(FakeServer.getRequests('HEAD', otherDocumentUrl)).toHaveLength(1);
    });

    it('detects WAC from container ACLs', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acl', { 'WAC-Allow': 'public=""' });
        respondWithLinks(containerUrl, '.acl');
        FakeServer.respond(`${documentUrl}.acl`, FakeResponse.notFound());
        FakeServer.respond(`${containerUrl}.acl`, '<#owner> a <http://www.w3.org/ns/auth/acl#Authorization> .');

        // Act
        const permissions = await movie.fetchPermissions();

        // Assert
        expect(permissions).toEqual({ protocol: 'wac', publicPermissions: [] });
        expect(FakeServer.getRequests(rootUrl)).toHaveLength(0);
    });

    it('fetches ACP grants', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acr', { 'WAC-Allow': 'public="read"' });
        respondWithACR(
            `${documentUrl}.acr`,
            `
                <#it> acp:resource <spirited-away> ; acp:accessControl <#bob> .
                <#bob> acp:apply [ acp:allow acl:Read ; acp:anyOf [ acp:agent <https://bob.example/profile/card#me> ] ] .
            `,
        );

        // Act
        const permissions = await movie.fetchPermissions();

        // Assert
        expect(movie.usesACP()).toBe(true);
        expect(movie.isPublic()).toBe(true);
        expect(permissions.protocol === 'acp' && permissions.accessControlResources).toHaveLength(1);
        expect(movie.requireACPAccessControlResources()[0]?.accessControls?.map(({ url }) => url)).toEqual([
            `${documentUrl}.acr#bob`,
        ]);
        expect(FakeServer.getRequests()).toHaveLength(2);
    });

    it('detects ACP from container ACRs', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acr');
        respondWithACR(`${documentUrl}.acr`, null);
        respondWithLinks(containerUrl, '.acr');
        respondWithACR(`${containerUrl}.acr`, '<#it> acp:resource <./> .');

        // Act
        const permissions = await movie.fetchPermissions();

        // Assert
        expect(permissions.protocol).toEqual('acp');
        expect(permissions.publicPermissions).toBeNull();
        expect(movie.requireACPAccessControlResources()).toEqual([]);
        expect(FakeServer.getRequests(rootUrl)).toHaveLength(0);
    });

    it('fails getting public permissions without WAC-Allow headers', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acr');
        respondWithACR(`${documentUrl}.acr`, '<#it> acp:resource <spirited-away> .');

        // Act
        await movie.fetchPermissions();

        // Assert
        expect(() => movie.isPublic()).toThrow(SoukaiError);
        expect(() => movie.isPrivate()).toThrow(SoukaiError);
    });

    it('fails getting permissions before loading them', () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        // Act & Assert
        expect(() => movie.isPublic()).toThrow(SoukaiError);
        expect(() => movie.usesACP()).toThrow(SoukaiError);
    });

    it('detects protocols again when remembered WAC responses are missing WAC-Allow', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        rememberAuthorizationProtocol(rootUrl, 'wac');
        respondWithLinks(documentUrl, 'spirited-away.acr');
        respondWithACR(`${documentUrl}.acr`, '<#it> acp:resource <spirited-away> .');

        // Act
        const permissions = await movie.fetchPermissions();

        // Assert
        expect(permissions.protocol).toEqual('acp');
    });

    it('finds access control documents in complex link headers', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        FakeServer.respond(
            documentUrl,
            FakeResponse.success(undefined, {
                Link: '<http://www.w3.org/ns/ldp#Resource>; rel="type", <spirited-away.acr>; anchor="a,b"; rel=acl',
            }),
        );
        respondWithACR(`${documentUrl}.acr`, '<#it> acp:resource <spirited-away> .');

        // Act
        const permissions = await movie.fetchPermissions();

        // Assert
        expect(permissions.protocol).toEqual('acp');
    });

    it('fails reading permissions of forbidden documents', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        FakeServer.respond(documentUrl, new Response(null, { status: 403 }));

        // Act
        const promisedPermissions = movie.fetchPermissions();

        // Assert
        await expect(promisedPermissions).rejects.toBeInstanceOf(Unauthorized);
    });

    it('reads public permissions without access to access control documents', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });
        const otherMovie = new Movie({ url: `${rootUrl}shows/spirited-away#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acl', { 'WAC-Allow': 'user="read", public="read"' });
        FakeServer.respond(`${documentUrl}.acl`, new Response(null, { status: 403 }));
        respondWithLinks(otherMovie.requireDocumentUrl(), 'spirited-away.acl', { 'WAC-Allow': 'user="read"' });
        FakeServer.respond(`${otherMovie.requireDocumentUrl()}.acl`, FakeResponse.notFound());
        respondWithLinks(`${rootUrl}shows/`, '.acl');
        FakeServer.respond(`${rootUrl}shows/.acl`, new Response(null, { status: 403 }));

        // Act
        const permissions = await movie.fetchPermissions();
        const otherPermissions = await otherMovie.fetchPermissions();

        // Assert
        expect(permissions).toEqual({ protocol: 'unknown', publicPermissions: [SolidDocumentPermissions.Read] });
        expect(movie.isPublic()).toBe(true);
        expect(() => movie.usesWAC()).toThrow(SoukaiError);
        expect(() => movie.usesACP()).toThrow(SoukaiError);
        expect(otherPermissions).toEqual({ protocol: 'unknown', publicPermissions: [] });
        expect(otherMovie.isPrivate()).toBe(true);
    });

    it('fails detecting protocols with forbidden containers', async () => {
        // Arrange
        const movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' });

        respondWithLinks(documentUrl, 'spirited-away.acr');
        respondWithACR(`${documentUrl}.acr`, null);
        FakeServer.respond(containerUrl, new Response(null, { status: 403 }));

        // Act
        const promisedPermissions = movie.fetchPermissions();

        // Assert
        await expect(promisedPermissions).rejects.toThrow(new Unauthorized(containerUrl, 403));
        expect(FakeServer.getRequests(rootUrl)).toHaveLength(0);
    });
});
