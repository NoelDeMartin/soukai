import { beforeEach, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { bootModels, setEngine } from 'soukai';
import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { SolidDocumentPermission } from '@noeldemartin/solid-utils';

import { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import { SolidACLAuthorization } from 'soukai-solid/models';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';

describe('WAC', () => {

    beforeEach(() => {
        Movie.collection = 'https://my-pod.com/movies/';

        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Movie, SolidACLAuthorization });
    });

    it('Makes private documents public', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const movie = new Movie(
            {
                url: `${documentUrl}#it`,
                name: faker.random.word(),
            },
            true,
        );

        FakeServer.respondOnce(
            '*',
            FakeResponse.success(undefined, { 'WAC-Allow': 'user="append control read write"' }),
        );
        FakeServer.respondOnce('*', FakeResponse.success(undefined, { Link: `<${documentUrl}.acl>; rel="acl"` }));
        FakeServer.respondOnce(
            '*',
            `
                @prefix acl: <http://www.w3.org/ns/auth/acl#> .

                <#owner>
                    a acl:Authorization ;
                    acl:agent <owner> ;
                    acl:accessTo <${documentUrl}> ;
                    acl:mode acl:Read, acl:Write, acl:Control .
            `,
        );
        FakeServer.respondOnce('*'); // GET documentExists
        FakeServer.respondOnce('*'); // PATCH update

        // Act
        await movie.fetchPublicPermissionsIfMissing();
        await movie.updatePublicPermissions([SolidDocumentPermission.Read]);

        // Assert
        expect(movie.isPublic).toBe(true);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(5);

        expect(FakeServer.fetchSpy.mock.calls[4]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix acl: <http://www.w3.org/ns/auth/acl#> .
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <#public>
                    a acl:Authorization ;
                    acl:agentClass foaf:Agent ;
                    acl:accessTo <${documentUrl}> ;
                    acl:mode acl:Read .
            }
        `);
    });

});
