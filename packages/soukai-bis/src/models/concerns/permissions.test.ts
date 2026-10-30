import { SolidDocumentPermissions, UnsupportedAuthorizationProtocol } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Container from 'soukai-bis/models/ldp/Container';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('Permissions', () => {
    let movie: Movie;

    const containerUrl = 'https://alice.example/movies/';
    const documentUrl = `${containerUrl}spirited-away`;
    const aclUrl = `${documentUrl}.acl`;
    const prefixes = `
        @prefix acl: <http://www.w3.org/ns/auth/acl#>.
        @prefix foaf: <http://xmlns.com/foaf/0.1/>.
    `;

    function respondWithInheritedACL(turtle: string): void {
        FakeServer.respond(documentUrl, FakeResponse.success(undefined, { Link: '<spirited-away.acl>; rel="acl"' }));
        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
        FakeServer.respond(`${containerUrl}.acl`, `${prefixes}\n${turtle}`);
        FakeServer.respondWith(aclUrl, (request) =>
            request.method === 'GET' ? FakeResponse.notFound() : FakeResponse.success(),
        );
    }

    function respondWithDocumentACL(turtle: string): void {
        FakeServer.respond(documentUrl, FakeResponse.success(undefined, { Link: '<spirited-away.acl>; rel="acl"' }));
        FakeServer.respondWith(aclUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(`${prefixes}\n${turtle}`) : FakeResponse.success(),
        );
    }

    beforeEach(() => {
        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));

        movie = new Movie({ url: `${documentUrl}#it`, title: 'Spirited Away' }, { exists: true });
    });

    it('creates document ACLs from inherited authorizations', async () => {
        // Arrange
        respondWithInheritedACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:origin <https://app.example>;
                acl:accessTo <./>;
                acl:default <./>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#friends>
                a acl:Authorization;
                acl:agent <https://bob.example/profile/card#me>;
                acl:default <./>;
                acl:mode acl:Read.

            <#container>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:accessTo <./>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(movie.isPublic()).toBe(true);
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:origin <https://app.example>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read, acl:Write, acl:Control.

                <#friends>
                    a acl:Authorization;
                    acl:agent <https://bob.example/profile/card#me>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('creates container ACLs that apply to children', async () => {
        // Arrange
        const container = new Container({ url: containerUrl }, { exists: true });

        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
        FakeServer.respond('https://alice.example/', FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
        FakeServer.respond(
            'https://alice.example/.acl',
            `
                ${prefixes}

                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:default <./>;
                    acl:mode acl:Read, acl:Write, acl:Control.
            `,
        );
        FakeServer.respondWith(`${containerUrl}.acl`, (request) =>
            request.method === 'GET' ? FakeResponse.notFound() : FakeResponse.success(),
        );

        // Act
        await container.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequest('PATCH', `${containerUrl}.acl`)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <${containerUrl}>;
                    acl:default <${containerUrl}>;
                    acl:mode acl:Read, acl:Write, acl:Control.

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${containerUrl}>;
                    acl:default <${containerUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('makes container contents public in existing container ACLs', async () => {
        // Arrange
        const container = new Container({ url: containerUrl }, { exists: true });

        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"' }));
        FakeServer.respondWith(`${containerUrl}.acl`, (request) =>
            request.method === 'GET'
                ? FakeResponse.success(`
                    ${prefixes}

                    <#owner>
                        a acl:Authorization;
                        acl:agent <https://alice.example/profile/card#me>;
                        acl:accessTo <./>;
                        acl:default <./>;
                        acl:mode acl:Read, acl:Write, acl:Control.

                    <#public>
                        a acl:Authorization;
                        acl:agentClass foaf:Agent;
                        acl:accessTo <./>;
                        acl:mode acl:Read.
                `)
                : FakeResponse.success(),
        );

        // Act
        await container.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', `${containerUrl}.acl`)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', `${containerUrl}.acl`)?.body).toEqualSparql(`
            INSERT DATA { <#public> <http://www.w3.org/ns/auth/acl#default> <${containerUrl}> . }
        `);
    });

    it('does not create document ACLs without control access', async () => {
        // Arrange
        respondWithInheritedACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./>;
                acl:mode acl:Read, acl:Write, acl:Control.
        `);

        // Act
        const promisedUpdate = movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        await expect(promisedUpdate).rejects.toThrow(SoukaiError);
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(0);
    });

    it('does not create document ACLs when inherited permissions match', async () => {
        // Arrange
        respondWithInheritedACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:default <./>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#public>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:default <./>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(0);
    });

    it('adds public authorizations to document ACLs', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#public>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#public-[[.*]]>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('updates public authorizations in document ACLs', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#public>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            DELETE DATA { <#public> <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Write> . }
        `);
    });

    it('removes public authorizations from document ACLs', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#public>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([]);

        // Assert
        expect(movie.isPrivate()).toBe(true);
        expect(FakeServer.getRequests('DELETE', aclUrl)).toHaveLength(0);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            DELETE DATA {
                ${prefixes}

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('skips document ACLs that already grant the permissions', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#public>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(0);
    });

    it('does not revoke permissions granted by shared authorizations', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#shared>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:agent <https://bob.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read.
        `);

        // Act
        const promisedUpdate = movie.updatePublicPermissions([]);

        // Assert
        await expect(promisedUpdate).rejects.toThrow(SoukaiError);
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(0);
    });

    it('ignores public authorizations restricted to origins in document ACLs', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#app>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:origin <https://app.example>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('keeps inherited public authorizations restricted to origins when creating document ACLs', async () => {
        // Arrange
        respondWithInheritedACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:default <./>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#app>
                a acl:Authorization;
                acl:agentClass foaf:Agent;
                acl:origin <https://app.example>;
                acl:default <./>;
                acl:mode acl:Read.
        `);

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read, acl:Write, acl:Control.

                <#app>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:origin <https://app.example>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('fails with ACP resources', async () => {
        // Arrange
        FakeServer.respond(documentUrl, FakeResponse.success(undefined, { Link: '<spirited-away.acr>; rel="acl"' }));
        FakeServer.respond(
            `${documentUrl}.acr`,
            FakeResponse.success(undefined, {
                Link: '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"',
            }),
        );

        // Act
        const promisedUpdate = movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        await expect(promisedUpdate).rejects.toBeInstanceOf(UnsupportedAuthorizationProtocol);
    });

    it('fails without a Solid engine', async () => {
        // Arrange
        setEngine(new InMemoryEngine());

        // Act
        const promisedUpdate = movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        await expect(promisedUpdate).rejects.toThrow(SoukaiError);
        expect(FakeServer.getRequests()).toHaveLength(0);
    });

    it('fetches public permissions', async () => {
        // Arrange
        FakeServer.respond(documentUrl, FakeResponse.success(undefined, { 'WAC-Allow': 'public="read"' }));

        // Act
        const permissions = await movie.fetchPublicPermissions();

        // Assert
        expect(permissions).toEqual([SolidDocumentPermissions.Read]);
        expect(movie.isPublic()).toBe(true);
    });
});
