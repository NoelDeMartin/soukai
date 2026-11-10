import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import Container from './Container';

describe('Container', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('creates containers from type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

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
                    solid:forClass schema:WatchAction, schema:Movie ;
                    solid:instanceContainer <https://alice.example/watched/> .

                <#movies-again>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Article ;
                    solid:instanceContainer <https://alice.example/posts/> .

                <#movie>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/spirited-away> .
            `,
        );

        // Act
        const containers = await Container.createFromTypeIndex(typeIndexUrl, Movie);

        // Assert
        expect(containers.map((container) => container.url)).toEqual([
            'https://alice.example/movies/',
            'https://alice.example/watched/',
        ]);
        expect(containers.every((container) => container.exists())).toBe(true);
    });

    it('creates containers registered for all the classes of a model', async () => {
        // Arrange
        class Todo extends defineSchema({
            rdfContexts: { schema: 'https://schema.org/', ical: 'http://www.w3.org/2002/12/cal/ical#' },
            rdfClasses: ['schema:Action', 'ical:Vtodo'],
        }) {}

        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        bootModels({ Todo });

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#> .

                <> a solid:TypeIndex .

                <#actions>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Action ;
                    solid:instanceContainer <https://alice.example/actions/> .

                <#todos>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Action, ical:Vtodo ;
                    solid:instanceContainer <https://alice.example/todos/> .
            `,
        );

        // Act
        const containers = await Container.createFromTypeIndex(typeIndexUrl, Todo);

        // Assert
        expect(containers.map((container) => container.url)).toEqual(['https://alice.example/todos/']);
    });

    it('registers containers in type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const container = new Container({ url: 'https://alice.example/movies/' }, { exists: true });

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        await container.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instanceContainer <https://alice.example/movies/> .
            }
        `);
    });

    it('does not register containers twice using type index urls', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const container = new Container({ url: 'https://alice.example/movies/' }, { exists: true });

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
            `,
        );

        // Act
        await container.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.getRequests('PATCH', typeIndexUrl)).toHaveLength(0);
    });
});
