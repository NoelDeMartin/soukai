import { beforeEach, describe, expect, it } from 'vitest';
import { bootModels, setEngine } from 'soukai';
import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';

import SolidContainer from 'soukai-solid/models/SolidContainer';
import SolidDocument from 'soukai-solid/models/SolidDocument';
import SolidTypeIndex from 'soukai-solid/models/SolidTypeIndex';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';
import { loadFixture } from 'soukai-solid/testing/utils';

class MovieWithTimestamps extends Movie {

    public static timestamps = true;

}

const fixture = (name: string) => loadFixture(`solid-interop/${name}`);

describe('Solid Interoperability', () => {

    beforeEach(() => {
        Movie.collection = 'https://my-pod.com/movies/';

        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Movie, WatchAction, MovieWithTimestamps });
    });

    it('Fixes malformed attributes', async () => {
        // Arrange
        const url = 'solid://movies/spirited-away#it';
        const turtle = `
            @prefix schema: <https://schema.org/>.

            <#it>
                a schema:Movie;
                schema:name "Spirited Away";
                schema:image "https://www.themoviedb.org/t/p/w600_and_h900_bestv2/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg";
                schema:sameAs "https://www.imdb.com/title/tt0245429", "https://www.themoviedb.org/movie/129" .
        `;

        FakeServer.respondOnce('*', turtle);
        FakeServer.respondOnce('*', turtle);
        FakeServer.respondOnce('*');

        // Act
        const movie = (await MovieWithTimestamps.find(url)) as MovieWithTimestamps;
        const malformations = movie.getMalformedDocumentAttributes();

        movie.fixMalformedAttributes();

        await movie.withoutTimestamps(() => movie.save());

        // Assert
        expect(malformations);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);

        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/>.

                <#it>
                    schema:image "https://www.themoviedb.org/t/p/w600_and_h900_bestv2/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg" ;
                    schema:sameAs "https://www.imdb.com/title/tt0245429", "https://www.themoviedb.org/movie/129" .
            } ;
            INSERT DATA {
                @prefix schema: <https://schema.org/>.
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

                <#it>
                    schema:image <https://www.themoviedb.org/t/p/w600_and_h900_bestv2/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg> ;
                    schema:sameAs <https://www.imdb.com/title/tt0245429>, <https://www.themoviedb.org/movie/129> .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "[[date][.*]]"^^xsd:dateTime ;
                    crdt:updatedAt "[[date][.*]]"^^xsd:dateTime .
            }
        `);
    });

    it('Reads http and https schemes', async () => {
        // Arrange
        const url = 'solid://movies/spirited-away#it';
        const turtle = `
            @prefix schema: <http://schema.org/>.

            <#it>
                a schema:Movie;
                schema:name "Spirited Away".
        `;

        FakeServer.respondOnce(url, FakeResponse.success(turtle));

        // Act
        Movie.aliasRdfPrefixes({ 'https://schema.org': 'http://schema.org' });

        const movies = await Movie.all({ $in: [url] });

        // Assert
        expect(movies).toHaveLength(1);
        expect(movies[0]?.title).toEqual('Spirited Away');
        expect(movies[0]?.usesRdfAliases()).toBe(true);
    });

    it('Reads instances from the type index', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });
        const movieUrl = `${podUrl}/movies/spirited-away`;

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success(fixture('type-index.ttl')));

        // Act
        const movieDocuments = await SolidDocument.fromTypeIndex(typeIndexUrl, Movie);

        // Assert
        expect(movieDocuments).toHaveLength(1);
        expect(movieDocuments[0]?.url).toEqual(movieUrl);
    });

    it('Reads containers from the type index', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });
        const moviesContainerUrl = `${podUrl}/movies`;

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success(fixture('type-index.ttl')));

        // Act
        const movieContainers = await SolidContainer.fromTypeIndex(typeIndexUrl, Movie);

        // Assert
        expect(movieContainers).toHaveLength(1);
        expect(movieContainers[0]?.url).toEqual(moviesContainerUrl);
    });

    it('Registers instances in the type index', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });
        const movieDocumentUrl = `${podUrl}/movies/midsommar`;
        const movieUrl = `${movieDocumentUrl}#it`;

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success(fixture('type-index.ttl')));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());

        // Act
        const movie = new Movie({ url: movieUrl });

        await movie.registerInTypeIndex(typeIndexUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/>.

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instance <${movieDocumentUrl}>.
            }
        `);
    });

    it('Registers containers in the type index', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });
        const moviesContainerUrl = `${podUrl}/great-movies`;

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success(fixture('type-index.ttl')));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());

        // Act
        const movies = new SolidContainer({ url: moviesContainerUrl });

        await movies.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/>.

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instanceContainer <${moviesContainerUrl}>.
            }
        `);
    });

    it('Registers containers with type index instances', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });
        const moviesContainerUrl = `${podUrl}/great-movies`;

        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success(fixture('type-index.ttl')));
        FakeServer.respondOnce(typeIndexUrl, FakeResponse.success());

        // Act
        const movies = new SolidContainer({ url: moviesContainerUrl });
        const typeIndex = new SolidTypeIndex({ url: typeIndexUrl }, true);

        typeIndex.setRelationModels('registrations', []);

        await movies.register(typeIndex, Movie);

        // Assert
        expect(typeIndex.registrations).toHaveLength(1);
        expect(typeIndex.registrations[0]?.instanceContainer).toEqual(moviesContainerUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/>.

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instanceContainer <${moviesContainerUrl}>.
            }
        `);
    });

});
