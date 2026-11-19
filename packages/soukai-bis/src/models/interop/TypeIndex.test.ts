import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it } from 'vite-plus/test';

import TypeIndex from './TypeIndex';

describe('TypeIndex', () => {
    useSolidEngine();

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
        const containers = await typeIndex.findContainers(Post);

        // Assert
        expect(containers.map((container) => container.url)).toEqual([containerUrl]);
        expect(typeIndex.isPublicRegistration()).toBeNull();
        expect(typeIndex.isPrivateRegistration()).toBeNull();
    });

    it('finds registrations for models with multiple classes', async () => {
        // Arrange
        class WatchedMovie extends defineSchema(Movie, { rdfClasses: ['Movie', 'WatchAction'] }) {}

        const typeIndexUrl = fakeDocumentUrl();

        bootModels({ WatchedMovie });

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <> a solid:TypeIndex .

                <#movies>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .

                <#watched>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie, schema:WatchAction ;
                    solid:instanceContainer <https://alice.example/watched/> .

                <#watched-spirited-away>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie, schema:WatchAction ;
                    solid:instance <https://alice.example/watched/spirited-away#it> .

                <#spirited-away>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/spirited-away#it> .
            `,
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);
        const movieRegistrations = await typeIndex.findRegistrations(Movie);
        const watchedRegistrations = await typeIndex.findRegistrations(WatchedMovie);
        const movieContainerUrls = await typeIndex.findContainerUrls(Movie);
        const watchedContainerUrls = await typeIndex.findContainerUrls(WatchedMovie);
        const movieInstanceUrls = await typeIndex.findInstanceUrls(Movie);
        const watchedInstanceUrls = await typeIndex.findInstanceUrls(WatchedMovie);

        // Assert
        expect(movieRegistrations).toHaveLength(4);
        expect(watchedRegistrations).toHaveLength(2);
        expect(movieContainerUrls).toEqual(['https://alice.example/movies/', 'https://alice.example/watched/']);
        expect(watchedContainerUrls).toEqual(['https://alice.example/watched/']);
        expect(movieInstanceUrls).toEqual([
            'https://alice.example/watched/spirited-away#it',
            'https://alice.example/movies/spirited-away#it',
        ]);
        expect(watchedInstanceUrls).toEqual(['https://alice.example/watched/spirited-away#it']);
    });

    it('registers containers', async () => {
        // Arrange
        class WatchedMovie extends defineSchema(Movie, { rdfClasses: ['Movie', 'WatchAction'] }) {}

        bootModels({ WatchedMovie });

        const typeIndexUrl = fakeDocumentUrl();
        const containerUrl = fakeContainerUrl();

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);

        await typeIndex.registerContainer(containerUrl, WatchedMovie);

        // Assert
        expect(typeIndex.registrations).toHaveLength(1);
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie, schema:WatchAction;
                    solid:instanceContainer <${containerUrl}> .
            }
        `);
    });

    it('registers instances', async () => {
        // Arrange
        const typeIndexUrl = fakeDocumentUrl();
        const instanceUrl = `${fakeDocumentUrl()}#it`;

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);

        await typeIndex.registerInstance(instanceUrl, Movie);

        // Assert
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instance <${instanceUrl}> .
            }
        `);
    });

    it('registers model instances using their classes', async () => {
        // Arrange
        const typeIndexUrl = fakeDocumentUrl();
        const movie = new Movie({ url: `${fakeDocumentUrl()}#it`, title: 'Spirited Away' });

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);

        await typeIndex.registerInstance(movie);

        // Assert
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instance <${movie.url}> .
            }
        `);
    });

    it('does not register containers and instances twice', async () => {
        // Arrange
        const typeIndexUrl = fakeDocumentUrl();
        const containerUrl = fakeContainerUrl();
        const instanceUrl = `${fakeDocumentUrl()}#it`;

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <> a solid:TypeIndex .

                <#movies>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <${containerUrl}> .

                <#movie>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <${instanceUrl}> .
            `,
        );

        // Act
        const typeIndex = await TypeIndex.findOrFail(typeIndexUrl);

        await typeIndex.registerContainer(containerUrl, Movie);
        await typeIndex.registerInstance(instanceUrl, Movie);

        // Assert
        expect(FakeServer.getRequests('PATCH', typeIndexUrl)).toHaveLength(0);
    });
});
