import {
    SolidDocumentPermissions,
    quadsToTurtle,
    sparqlToQuadsSync,
    turtleToQuadsSync,
} from '@noeldemartin/solid-utils';
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
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([
            `${aclUrl}#owner`,
            `${aclUrl}#friends`,
            `${aclUrl}#public`,
        ]);
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
        expect(movie.requireWACAuthorizations()).toEqual([]);
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
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([`${aclUrl}#owner`]);
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

    it('creates WAC authorizations in document ACLs', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.
        `);

        await movie.fetchPermissions();

        // Act
        const authorization = await movie.createWACAuthorization({
            agents: ['https://bob.example/profile/card#me'],
            modes: ['http://www.w3.org/ns/auth/acl#Read'],
        });

        // Assert
        expect(authorization.exists()).toBe(true);
        expect(authorization.url.startsWith(`${aclUrl}#`)).toBe(true);
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([`${aclUrl}#owner`, authorization.url]);
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#[[.*]]>
                    a acl:Authorization;
                    acl:agent <https://bob.example/profile/card#me>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('creates WAC authorizations with inherited authorizations', async () => {
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

        await movie.fetchPermissions();

        // Act
        const authorization = await movie.createWACAuthorization({
            agents: ['https://bob.example/profile/card#me'],
            modes: ['http://www.w3.org/ns/auth/acl#Write'],
        });

        // Assert
        expect(authorization.exists()).toBe(true);
        expect(authorization.agents).toEqual(['https://bob.example/profile/card#me']);
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([
            `${aclUrl}#owner`,
            `${aclUrl}#public`,
            authorization.url,
        ]);
        expect(FakeServer.getRequests('PATCH', aclUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', aclUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read, acl:Write, acl:Control.

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.

                <#[[.*]]>
                    a acl:Authorization;
                    acl:agent <https://bob.example/profile/card#me>;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Write.
            }
        `);
    });

    it('creates default WAC authorizations for containers', async () => {
        // Arrange
        const container = new Container({ url: containerUrl }, { exists: true });

        respondWithDocument(containerUrl, '.acl');
        respondWithUpdatableACL(
            `${containerUrl}.acl`,
            `
                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <./>;
                    acl:default <./>;
                    acl:mode acl:Read, acl:Write, acl:Control.
            `,
        );

        await container.fetchPermissions();

        // Act
        const authorization = await container.createWACAuthorization({
            agents: ['https://bob.example/profile/card#me'],
            modes: ['http://www.w3.org/ns/auth/acl#Read'],
        });

        // Assert
        expect(authorization.accessTo).toEqual([containerUrl]);
        expect(authorization.default).toEqual([containerUrl]);
        expect(FakeServer.getRequest('PATCH', `${containerUrl}.acl`)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#[[.*]]>
                    a acl:Authorization;
                    acl:agent <https://bob.example/profile/card#me>;
                    acl:accessTo <${containerUrl}>;
                    acl:default <${containerUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    it('refreshes permissions after creating WAC authorizations', async () => {
        // Arrange
        respondWithDocument(documentUrl, 'spirited-away.acl', () =>
            FakeServer.getRequests('PATCH', aclUrl).length > 0 ? 'read' : '',
        );
        respondWithUpdatableACL(
            aclUrl,
            `
                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <./spirited-away>;
                    acl:mode acl:Read, acl:Write, acl:Control.
            `,
        );

        await movie.fetchPermissions();

        // Act
        const authorization = await movie.createWACAuthorization({
            agentClasses: ['http://xmlns.com/foaf/0.1/Agent'],
            modes: ['http://www.w3.org/ns/auth/acl#Read'],
        });

        // Assert
        expect(movie.isPublic()).toBe(true);
        expect(movie.requireWACAuthorizations()).toContain(authorization);
    });

    it('refreshes permissions after updating public permissions', async () => {
        // Arrange
        respondWithDocument(documentUrl, 'spirited-away.acl', () =>
            FakeServer.getRequests('PATCH', aclUrl).length > 0 ? 'read' : '',
        );
        respondWithUpdatableACL(
            aclUrl,
            `
                <#owner>
                    a acl:Authorization;
                    acl:agent <https://alice.example/profile/card#me>;
                    acl:accessTo <./spirited-away>;
                    acl:mode acl:Read, acl:Write, acl:Control.
            `,
        );

        // Act
        await movie.updatePublicPermissions([SolidDocumentPermissions.Read]);

        // Assert
        expect(movie.isPublic()).toBe(true);
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([`${aclUrl}#owner`, `${aclUrl}#public`]);
    });

    it('ignores deleted WAC authorizations', async () => {
        // Arrange
        respondWithDocumentACL(`
            <#owner>
                a acl:Authorization;
                acl:agent <https://alice.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read, acl:Write, acl:Control.

            <#bob>
                a acl:Authorization;
                acl:agent <https://bob.example/profile/card#me>;
                acl:accessTo <./spirited-away>;
                acl:mode acl:Read.
        `);

        await movie.fetchPermissions();

        // Act
        await movie.requireWACAuthorizations()[1]?.delete();

        // Assert
        expect(movie.requireWACAuthorizations().map(({ url }) => url)).toEqual([`${aclUrl}#owner`]);
    });

    it('updates permissions of models using non-Solid engines', async () => {
        // Arrange
        setEngine(new InMemoryEngine());
        respondWithDocumentACL(`
            <#owner>
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

                <#public>
                    a acl:Authorization;
                    acl:agentClass foaf:Agent;
                    acl:accessTo <${documentUrl}>;
                    acl:mode acl:Read.
            }
        `);
    });

    function respondWithUpdatableACL(url: string, turtle: string | null): void {
        let quads = turtle === null ? null : turtleToQuadsSync(`${prefixes}\n${turtle}`, { baseIRI: url });

        FakeServer.respondWith(url, (request) => {
            if (request.method === 'GET') {
                return quads ? FakeResponse.success(quadsToTurtle(quads)) : FakeResponse.notFound();
            }

            const { insert = [], delete: remove = [] } = sparqlToQuadsSync(request.body, { baseIRI: url });

            quads = [...(quads ?? []).filter((quad) => !remove.some((other) => other.equals(quad))), ...insert];

            return FakeResponse.success();
        });
    }

    function respondWithDocument(url: string, aclLink: string, publicPermissions?: () => string): void {
        FakeServer.respondWith(url, () =>
            FakeResponse.success(undefined, {
                Link: `<${aclLink}>; rel="acl"`,
                ...(publicPermissions ? { 'WAC-Allow': `public="${publicPermissions()}"` } : {}),
            }),
        );
    }

    function respondWithInheritedACL(turtle: string): void {
        respondWithDocument(documentUrl, 'spirited-away.acl');
        respondWithDocument(containerUrl, '.acl');
        respondWithUpdatableACL(`${containerUrl}.acl`, turtle);
        respondWithUpdatableACL(aclUrl, null);
    }

    function respondWithDocumentACL(turtle: string): void {
        respondWithDocument(documentUrl, 'spirited-away.acl');
        respondWithUpdatableACL(aclUrl, turtle);
    }
});
