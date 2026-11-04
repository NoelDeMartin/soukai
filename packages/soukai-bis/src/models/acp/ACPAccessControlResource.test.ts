import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Container from 'soukai-bis/models/ldp/Container';
import ManagerGrant from 'soukai-bis/testing/stubs/ManagerGrant';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import type ACPAccessControlResource from './ACPAccessControlResource';
import ACPMatcher from './ACPMatcher';
import ACPPolicy from './ACPPolicy';

describe('ACPAccessControlResource', () => {
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

    function respondWithACR(turtle: string | null): void {
        FakeServer.respond(containerUrl, FakeResponse.success(undefined, { Link: '<.acr>; rel="acl"' }));
        FakeServer.respondWith(acrUrl, (request) => {
            if (request.method !== 'GET') {
                return FakeResponse.success();
            }

            return turtle === null ? FakeResponse.notFound() : FakeResponse.success(`${prefixes}\n${turtle}`, acrType);
        });

        if (turtle === null) {
            FakeServer.respond(rootUrl, FakeResponse.success(undefined, { Link: '<.acr>; rel="acl"' }));
            FakeServer.respond(
                `${rootUrl}.acr`,
                FakeResponse.success('<#root> a <http://www.w3.org/ns/solid/acp#AccessControlResource> .', acrType),
            );
        }
    }

    async function fetchAccessControlResource(): Promise<ACPAccessControlResource> {
        const container = new RemoteContainer({ url: containerUrl }, { exists: true });

        await container.fetchPermissions({ accessControlClass: ManagerGrant });

        const [accessControlResource] = container.requireACPAccessControlResources();

        return accessControlResource ?? container.newACPAccessControlResource();
    }

    function attachManagerGrant(
        accessControlResource: ACPAccessControlResource,
        attributes: { url?: string; agent: string; createdAt: Date },
    ): ManagerGrant {
        const grant = new ManagerGrant({ url: attributes.url, createdAt: attributes.createdAt });
        const policy = new ACPPolicy({
            allow: ['http://www.w3.org/ns/auth/acl#Read', 'http://www.w3.org/ns/auth/acl#Write'],
        });

        policy.relatedAnyOfMatchers.attach(new ACPMatcher({ agents: [attributes.agent] }));
        grant.relatedPolicies.attach(policy);
        accessControlResource.relatedAccessControls.attach(grant);
        accessControlResource.relatedMemberAccessControls.attach(grant);

        return grant;
    }

    beforeEach(() => RemoteContainer.setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('creates ACRs with new access controls', async () => {
        // Arrange
        respondWithACR(null);

        const accessControlResource = await fetchAccessControlResource();
        const grant = attachManagerGrant(accessControlResource, {
            agent: 'https://bob.example/profile/card#me',
            createdAt: new Date('2026-11-03T10:00:00Z'),
        });

        // Act
        await accessControlResource.save();

        // Assert
        const grantId = grant.url?.split('#')[1];
        const policyId = grant.policies?.[0]?.url?.split('#')[1];
        const matcherId = grant.policies?.[0]?.anyOfMatchers?.[0]?.url?.split('#')[1];

        expect(accessControlResource.url).toEqual(`${acrUrl}#it`);
        expect(FakeServer.getRequests('PATCH', acrUrl)).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', acrUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#it>
                    a acp:AccessControlResource ;
                    acp:resource <${containerUrl}> ;
                    acp:accessControl <#${grantId}> ;
                    acp:memberAccessControl <#${grantId}> .

                <#${grantId}>
                    a acp:AccessControl, ex:ManagerGrant ;
                    dct:created "2026-11-03T10:00:00.000Z"^^xsd:dateTime ;
                    acp:apply <#${policyId}> .

                <#${policyId}>
                    a acp:Policy ;
                    acp:allow acl:Read, acl:Write ;
                    acp:anyOf <#${matcherId}> .

                <#${matcherId}>
                    a acp:Matcher ;
                    acp:agent <https://bob.example/profile/card#me> .
            }
        `);
    });

    it('adds access controls to existing ACRs', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl <#owner> .

            <#owner>
                a acp:AccessControl ;
                acp:apply [
                    a acp:Policy ;
                    acp:allow acl:Read, acl:Write, acl:Control ;
                    acp:anyOf [ a acp:Matcher ; acp:agent <https://alice.example/profile/card#me> ]
                ] .
        `);

        const accessControlResource = await fetchAccessControlResource();
        const grant = attachManagerGrant(accessControlResource, {
            url: `${acrUrl}#manager-bob`,
            agent: 'https://bob.example/profile/card#me',
            createdAt: new Date('2026-11-03T10:00:00Z'),
        });

        // Act
        await accessControlResource.save();

        // Assert
        const policyId = grant.policies?.[0]?.url?.split('#')[1];
        const matcherId = grant.policies?.[0]?.anyOfMatchers?.[0]?.url?.split('#')[1];

        expect(FakeServer.getRequest('PATCH', acrUrl)?.body).toEqualSparql(`
            INSERT DATA {
                ${prefixes}

                <#logbook>
                    acp:accessControl <#manager-bob> ;
                    acp:memberAccessControl <#manager-bob> .

                <#manager-bob>
                    a acp:AccessControl, ex:ManagerGrant ;
                    dct:created "2026-11-03T10:00:00.000Z"^^xsd:dateTime ;
                    acp:apply <#${policyId}> .

                <#${policyId}>
                    a acp:Policy ;
                    acp:allow acl:Read, acl:Write ;
                    acp:anyOf <#${matcherId}> .

                <#${matcherId}>
                    a acp:Matcher ;
                    acp:agent <https://bob.example/profile/card#me> .
            }
        `);
    });

    it('creates access control resources in existing ACRs', async () => {
        // Arrange
        respondWithACR('<#other> acp:resource <https://alice.example/other/> .');

        const container = new RemoteContainer({ url: containerUrl }, { exists: true });

        await container.fetchPermissions();

        const accessControlResource = container.newACPAccessControlResource();
        const grant = attachManagerGrant(accessControlResource, {
            agent: 'https://bob.example/profile/card#me',
            createdAt: new Date('2026-11-03T10:00:00Z'),
        });

        // Act
        await accessControlResource.save();

        // Assert
        const grantId = grant.url?.split('#')[1];
        const body = FakeServer.getRequest('PATCH', acrUrl)?.body ?? '';

        expect(container.requireACPAccessControlResources().map(({ url }) => url)).toEqual([`${acrUrl}#other`]);
        expect(FakeServer.getRequests('PATCH', acrUrl)).toHaveLength(1);
        expect(body).toContain('<#it> <http://www.w3.org/ns/solid/acp#resource> <https://alice.example/logbook/>');
        expect(body).toContain(`<#it> <http://www.w3.org/ns/solid/acp#accessControl> <#${grantId}>`);
        expect(body).not.toContain('#other');
    });

    it('removes access controls', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl <#owner>, <#manager-bob> ;
                acp:memberAccessControl <#manager-bob> .

            <#owner> a acp:AccessControl ; acp:apply <#shared-policy> .
            <#shared-policy> a acp:Policy ; acp:allow acl:Read ; acp:anyOf <#shared-matcher> .
            <#shared-matcher> a acp:Matcher ; acp:agent <https://alice.example/profile/card#me> .

            <#manager-bob>
                a acp:AccessControl, ex:ManagerGrant ;
                dct:created "2026-11-03T10:00:00Z"^^xsd:dateTime ;
                acp:apply <#manager-bob-policy>, <#shared-policy> .

            <#manager-bob-policy> a acp:Policy ; acp:allow acl:Read, acl:Write ; acp:anyOf <#manager-bob-matcher> .
            <#manager-bob-matcher> a acp:Matcher ; acp:agent <https://bob.example/profile/card#me> .
        `);

        const accessControlResource = await fetchAccessControlResource();
        const grant = accessControlResource.accessControls?.find(
            (accessControl) => accessControl instanceof ManagerGrant,
        );

        // Act
        accessControlResource.removeAccessControl(grant as ManagerGrant);

        await accessControlResource.save();

        // Assert
        expect(accessControlResource.accessControlUrls).toEqual([`${acrUrl}#owner`]);
        expect(accessControlResource.memberAccessControlUrls).toEqual([]);
        expect(FakeServer.getRequest('PATCH', acrUrl)?.body).toEqualSparql(`
            DELETE DATA {
                ${prefixes}

                <#logbook>
                    acp:accessControl <#manager-bob> ;
                    acp:memberAccessControl <#manager-bob> .

                <#manager-bob>
                    a acp:AccessControl, ex:ManagerGrant ;
                    dct:created "2026-11-03T10:00:00Z"^^xsd:dateTime ;
                    acp:apply <#manager-bob-policy>, <#shared-policy> .

                <#manager-bob-policy> a acp:Policy ; acp:allow acl:Read, acl:Write ; acp:anyOf <#manager-bob-matcher> .
                <#manager-bob-matcher> a acp:Matcher ; acp:agent <https://bob.example/profile/card#me> .
            }
        `);
    });

    it('removes access controls with blank node policies', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl <#owner>, <#reader> .

            <#owner> a acp:AccessControl ; acp:apply [ acp:allow acl:Control ; acp:anyOf [ acp:agent <https://alice.example/profile/card#me> ] ] .
            <#reader> a acp:AccessControl ; acp:apply [ acp:allow acl:Read ; acp:anyOf [ acp:agent <https://bob.example/profile/card#me> ] ] .
        `);

        const accessControlResource = await fetchAccessControlResource();
        const reader = accessControlResource.accessControls?.find(({ url }) => url === `${acrUrl}#reader`);

        // Act
        accessControlResource.removeAccessControl(reader as ManagerGrant);

        await accessControlResource.save();

        // Assert
        const body = FakeServer.getRequest('PATCH', acrUrl)?.body ?? '';

        expect(body).toContain(`<#logbook> <http://www.w3.org/ns/solid/acp#accessControl> <#reader>`);
        expect(body).not.toContain('_:');
        expect(body).not.toContain('/.well-known/genid/');
    });

    it('fails removing blank node access controls', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl [ acp:apply [ acp:allow acl:Read ; acp:anyOf [ acp:agent acp:PublicAgent ] ] ] .
        `);

        const accessControlResource = await fetchAccessControlResource();
        const [accessControl] = accessControlResource.accessControls ?? [];

        // Act & Assert
        expect(() => accessControlResource.removeAccessControl(accessControl as ManagerGrant)).toThrow(SoukaiError);
    });

    it('fails saving changes that would overwrite blank nodes', async () => {
        // Arrange
        respondWithACR(`
            <#logbook>
                a acp:AccessControlResource ;
                acp:resource <./> ;
                acp:accessControl [ acp:apply [ acp:allow acl:Read ; acp:anyOf [ acp:agent acp:PublicAgent ] ] ] .
        `);

        const accessControlResource = await fetchAccessControlResource();

        attachManagerGrant(accessControlResource, {
            agent: 'https://bob.example/profile/card#me',
            createdAt: new Date('2026-11-03T10:00:00Z'),
        });

        // Act
        const promisedSave = accessControlResource.save();

        // Assert
        await expect(promisedSave).rejects.toThrow(SoukaiError);
        expect(FakeServer.getRequests('PATCH', acrUrl)).toHaveLength(0);
    });
});
