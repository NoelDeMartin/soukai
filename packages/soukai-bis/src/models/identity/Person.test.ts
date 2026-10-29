import { FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import Post from 'soukai-bis/testing/stubs/Post';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import Person from './Person';

describe('Person', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('finds registered containers in any type index', async () => {
        // Arrange
        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const containerUrl = fakeContainerUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        FakeServer.respondOnce(
            publicTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .
            `,
        );
        FakeServer.respondOnce(
            privateTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
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
        const container = await person.findRegisteredContainer(Post);

        // Assert
        expect(container?.url).toEqual(containerUrl);
    });
});
