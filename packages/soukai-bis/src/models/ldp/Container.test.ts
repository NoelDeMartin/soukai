import { FakeServer } from '@noeldemartin/testing';
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
        class WatchedMovie extends defineSchema(Movie, { rdfClass: 'WatchAction' }) {}

        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

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
                    solid:forClass schema:WatchAction, schema:Movie ;
                    solid:instanceContainer <https://alice.example/watched/> .
            `,
        );

        // Act
        const containers = await Container.createFromTypeIndex(typeIndexUrl, WatchedMovie);

        // Assert
        expect(containers.map((container) => container.url)).toEqual(['https://alice.example/watched/']);
    });
});
