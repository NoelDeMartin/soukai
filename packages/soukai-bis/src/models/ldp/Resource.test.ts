import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import Resource from './Resource';

describe('Resource', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('creates resources from type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <> a solid:TypeIndex .

                <#spirited-away>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/spirited-away#it> .

                <#spirited-away-again>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/spirited-away> .

                <#totoro>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/totoro#it> .

                <#movies>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .

                <#post>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Article ;
                    solid:instance <https://alice.example/posts/hello-world#it> .
            `,
        );

        // Act
        const documents = await Resource.createFromTypeIndex(typeIndexUrl, Movie);

        // Assert
        expect(documents.map((document) => document.url)).toEqual([
            'https://alice.example/movies/spirited-away',
            'https://alice.example/movies/totoro',
        ]);
        expect(documents.every((document) => document.exists())).toBe(true);
    });

    it('registers resources in type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const document = new Resource({ url: 'https://alice.example/movies/spirited-away' }, { exists: true });

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        await document.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instance <https://alice.example/movies/spirited-away> .
            }
        `);
    });

    it('fails registering resources without model classes', async () => {
        const instance = new Resource({ url: 'https://alice.example/movies/spirited-away' }, { exists: true });

        await expect(instance.register('https://alice.example/settings/privateTypeIndex')).rejects.toThrow(SoukaiError);
    });
});
