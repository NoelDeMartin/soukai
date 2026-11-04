import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import ACPAccessControl from 'soukai-bis/models/acp/ACPAccessControl';
import type ACPMatcher from 'soukai-bis/models/acp/ACPMatcher';
import Container from 'soukai-bis/models/ldp/Container';
import ManagerGrant from 'soukai-bis/testing/stubs/ManagerGrant';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('ACP', () => {
    const rootUrl = 'https://alice.example/';
    const containerUrl = `${rootUrl}logbook/`;
    const acrUrl = `${containerUrl}.acr`;
    const prefixes = `
        @prefix acl: <http://www.w3.org/ns/auth/acl#>.
        @prefix acp: <http://www.w3.org/ns/solid/acp#>.
        @prefix dct: <http://purl.org/dc/terms/>.
        @prefix ex: <https://example.org/vocab#>.
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
    `;
    const acrType = { Link: '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"' };

    class RemoteContainer extends Container {}

    let container: RemoteContainer;

    function respondWithACR(turtle: string | null): void {
        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acr>; rel="acl"' }));
        FakeServer.respond(
            acrUrl,
            turtle === null ? FakeResponse.notFound() : FakeResponse.success(`${prefixes}\n${turtle}`, acrType),
        );
    }

    function accessControlPolicies(accessControl?: ACPAccessControl) {
        const matcherData = (matchers?: ACPMatcher[]) =>
            matchers?.map(({ agents, clients, issuers }) => ({ agents, clients, issuers }));

        return accessControl?.policies?.map((policy) => ({
            allow: policy.allow,
            deny: policy.deny,
            allOf: matcherData(policy.allOfMatchers),
            anyOf: matcherData(policy.anyOfMatchers),
            noneOf: matcherData(policy.noneOfMatchers),
        }));
    }

    beforeEach(() => {
        RemoteContainer.setEngine(new SolidEngine({ fetch: FakeServer.fetch }));

        container = new RemoteContainer({ url: containerUrl }, { exists: true });
    });

    it('loads access controls', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                acp:resource <./> ;
                acp:accessControl <#owner>, <#manager-bob> ;
                acp:memberAccessControl <#manager-bob> .

            <#owner> acp:apply [
                acp:allow acl:Read, acl:Write, acl:Control ;
                acp:allOf [ acp:agent <https://alice.example/profile/card#me> ]
            ] .

            <#manager-bob> acp:apply <#manager-bob-policy> .
            <#manager-bob-policy> acp:allow acl:Read, acl:Write ; acp:deny acl:Write ; acp:allOf <#manager-bob-matcher> .
            <#manager-bob-matcher>
                acp:agent <https://bob.example/profile/card#me> ;
                acp:client <https://app.example/id> .
        `);

        // Act
        await container.fetchPermissions();

        // Assert
        const [accessControlResource] = container.requireACPAccessControlResources();
        const [owner, bob] = accessControlResource?.accessControls ?? [];

        expect(container.requireACPAccessControlResources()).toHaveLength(1);
        expect(accessControlResource?.memberAccessControls?.map(({ url }) => url)).toEqual([`${acrUrl}#manager-bob`]);
        expect(accessControlPolicies(owner)).toEqual([
            {
                allow: [
                    'http://www.w3.org/ns/auth/acl#Read',
                    'http://www.w3.org/ns/auth/acl#Write',
                    'http://www.w3.org/ns/auth/acl#Control',
                ],
                deny: [],
                allOf: [{ agents: ['https://alice.example/profile/card#me'], clients: [], issuers: [] }],
                anyOf: [],
                noneOf: [],
            },
        ]);
        expect(accessControlPolicies(bob)).toEqual([
            {
                allow: ['http://www.w3.org/ns/auth/acl#Read', 'http://www.w3.org/ns/auth/acl#Write'],
                deny: ['http://www.w3.org/ns/auth/acl#Write'],
                allOf: [
                    {
                        agents: ['https://bob.example/profile/card#me'],
                        clients: ['https://app.example/id'],
                        issuers: [],
                    },
                ],
                anyOf: [],
                noneOf: [],
            },
        ]);
    });

    it('loads access controls with custom classes', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl <#owner>, <#manager-bob> ;
                acp:memberAccessControl <#manager-bob> .

            <#owner> a acp:AccessControl ; acp:apply [ acp:allow acl:Control ; acp:anyOf [ acp:agent <https://alice.example/profile/card#me> ] ] .

            <#manager-bob>
                a acp:AccessControl, ex:ManagerGrant ;
                dct:created "2026-11-03T10:00:00Z"^^xsd:dateTime ;
                acp:apply <#manager-bob-policy> .

            <#manager-bob-policy> a acp:Policy ; acp:allow acl:Read ; acp:anyOf <#manager-bob-matcher> .
            <#manager-bob-matcher> a acp:Matcher ; acp:agent <https://bob.example/profile/card#me> .

            <#unlinked> a acp:AccessControl, ex:ManagerGrant .
        `);

        // Act
        await container.fetchPermissions({ accessControlClass: ManagerGrant });

        // Assert
        const [accessControlResource] = container.requireACPAccessControlResources();
        const [owner, bob] = accessControlResource?.accessControls ?? [];

        expect(accessControlResource?.accessControls).toHaveLength(2);
        expect(owner).toBeInstanceOf(ACPAccessControl);
        expect(owner).not.toBeInstanceOf(ManagerGrant);
        expect(bob).toBeInstanceOf(ManagerGrant);
        expect((bob as ManagerGrant).createdAt).toEqual(new Date('2026-11-03T10:00:00Z'));
        expect(bob?.policies?.[0]?.anyOfMatchers?.[0]?.agents).toEqual(['https://bob.example/profile/card#me']);
        expect(accessControlResource?.memberAccessControls?.[0]).toBe(bob);
    });

    it('creates access control resources for missing ACRs', async () => {
        // Arrange
        respondWithACR(null);
        FakeServer.respond(rootUrl, FakeResponse.success(undefined, { Link: '<.acr>; rel="acl"' }));
        FakeServer.respond(
            `${rootUrl}.acr`,
            FakeResponse.success('<#root> a <http://www.w3.org/ns/solid/acp#AccessControlResource> .', acrType),
        );

        // Act
        await container.fetchPermissions();

        const accessControlResource = container.newACPAccessControlResource();

        // Assert
        expect(container.requireACPAccessControlResources()).toEqual([]);
        expect(accessControlResource.url).toEqual(`${acrUrl}#it`);
        expect(accessControlResource.exists()).toBe(false);
        expect(accessControlResource.resourceUrls).toEqual([containerUrl]);
    });

    it('fails reading access control resources with WAC', async () => {
        // Arrange
        FakeServer.respond(
            containerUrl,
            FakeResponse.success(undefined, { Link: '<.acl>; rel="acl"', 'WAC-Allow': 'public=""' }),
        );
        FakeServer.respond(`${containerUrl}.acl`, '<#owner> a <http://www.w3.org/ns/auth/acl#Authorization> .');

        // Act
        await container.fetchPermissions();

        // Assert
        expect(container.usesWAC()).toBe(true);
        expect(() => container.requireACPAccessControlResources()).toThrow(SoukaiError);
    });
});
