import { beforeEach, describe, expect, it } from 'vitest';
import { bootModels, setEngine } from 'soukai';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { tap, uuid } from '@noeldemartin/utils';
import { faker } from '@noeldemartin/faker';

import Group from 'soukai-solid/testing/lib/stubs/Group';
import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';

import { loadFixture } from 'soukai-solid/testing/utils';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import IRI from 'soukai-solid/solid/utils/IRI';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';

const fixture = (name: string) => loadFixture(`solid-crud/${name}`);

describe('Solid CRUD', () => {

    beforeEach(() => {
        Movie.collection = 'https://my-pod.com/movies/';

        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Movie, Person, WatchAction, Group });
    });

    it('Creates models', async () => {
        // Arrange
        const title = faker.lorem.sentence();
        const releaseDate = new Date('1997-07-21T23:42:00Z');
        const watchDate = new Date('2002-09-15T23:42:00Z');

        FakeServer.respondOnce('*', FakeResponse.success());
        FakeServer.respondOnce('*', FakeResponse.success());

        // Act
        const movie = new Movie({ title, releaseDate });

        movie.relatedActions.create({ startTime: watchDate });

        await movie.save();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/>.

                <#it>
                    a schema:Movie ;
                    schema:name "${title}" ;
                    schema:datePublished "${releaseDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .

                <#[[.*]]>
                    a schema:WatchAction ;
                    schema:object <#it> ;
                    schema:startTime "${watchDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            }
        `);
    });

    it('Creates models in existing documents', async () => {
        // Arrange
        const title = faker.lorem.sentence();
        const watchDate = new Date('2002-09-15T23:42:00Z');
        const movie = new Movie({ title });
        const documentUrl = fakeDocumentUrl();

        await movie.relatedActions.create({ startTime: watchDate });

        FakeServer.respondOnce(
            '*',
            `
                @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.

                <#it> rdfs:label "Movies" .
            `,
        );
        FakeServer.respondOnce('*');

        // Act
        await movie.saveInDocument(documentUrl, 'movie');

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[0]).toEqual(documentUrl);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/>.

                <#movie>
                    a schema:Movie ;
                    schema:name "${title}" .

                <#[[.*]]>
                    a schema:WatchAction ;
                    schema:object <#movie> ;
                    schema:startTime "${watchDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            }
        `);
    });

    it('Creates model without url minting', async () => {
        // Arrange
        class MovieWithoutUrlMinting extends Movie {

            public static mintsUrls = false;
        
        }

        const title = faker.lorem.sentence();
        const releaseDate = new Date('1997-07-21T23:42:00Z');

        FakeServer.respondOnce('*', FakeResponse.success(undefined, { Location: Movie.collection + uuid() }));

        bootModels({ MovieWithoutUrlMinting });

        // Act
        const movie = await MovieWithoutUrlMinting.create({ title, releaseDate });

        // Assert
        expect(movie.url.startsWith(Movie.collection)).toBe(true);
        expect(movie.url.endsWith('#it')).toBe(true);
        expect(movie.url.length).toBeGreaterThan(Movie.collection.length + 3);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetchSpy.mock.calls[0]?.[1]?.body).toEqualTurtle(`
            @prefix schema: <https://schema.org/>.

            <#it>
                a schema:Movie ;
                schema:name "${title}" ;
                schema:datePublished "${releaseDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `);
    });

    it('Creates model without url minting nor hash', async () => {
        // Arrange
        class MovieWithoutUrlMinting extends Movie {

            public static mintsUrls = false;
            public static defaultResourceHash = null;
        
        }

        const title = faker.lorem.sentence();
        const releaseDate = new Date('1997-07-21T23:42:00Z');

        FakeServer.respondOnce('*', FakeResponse.success(undefined, { Location: Movie.collection + uuid() }));

        bootModels({ MovieWithoutUrlMinting });

        // Act
        const movie = await MovieWithoutUrlMinting.create({ title, releaseDate });

        // Assert
        expect(movie.url.startsWith(Movie.collection)).toBe(true);
        expect(movie.url.length).toBeGreaterThan(Movie.collection.length);
        expect(movie.url.includes('#')).toBe(false);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetchSpy.mock.calls[0]?.[1]?.body).toEqualTurtle(`
            @prefix schema: <https://schema.org/>.

            <>
                a schema:Movie ;
                schema:name "${title}" ;
                schema:datePublished "${releaseDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `);
    });

    it('Updates models', async () => {
        // Arrange
        const title = faker.lorem.sentence();
        const stub = await createStub();
        const movie = new Movie(stub.getAttributes(), true);

        FakeServer.respondOnce('*');

        // Act
        movie.setAttribute('title', title);
        movie.setAttribute('externalUrls', [
            ...movie.externalUrls,
            'https://example.org/one',
            'https://example.org/two',
        ]);
        movie.setAttribute('releaseDate', null);

        await movie.save();

        // Assert
        expect(movie.title).toBe(title);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it>
                    <${IRI('schema:name')}> "${stub.title}" ;
                    <${IRI('schema:datePublished')}>
                        "${stub.releaseDate?.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            } ;
            INSERT DATA {
                <#it>
                    <${IRI('schema:name')}> "${title}" ;
                    <${IRI('schema:sameAs')}> <https://example.org/one>, <https://example.org/two> .
            }
        `);
    });

    it('Updates array fields', async () => {
        // Arrange
        const movie = await createStub();
        const urls = movie.externalUrls.slice(0);

        FakeServer.respondOnce('*');

        // Act
        await movie.update({ externalUrls: [] });

        // Assert
        expect(movie.externalUrls).toEqual([]);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <${IRI('schema:sameAs')}> ${urls.map((url) => `<${url}>`).join(', ')} .
            }
        `);
    });

    it('Reads single models', async () => {
        // Arrange
        FakeServer.respondOnce(
            '*',
            FakeResponse.success(fixture('spirited-away.ttl'), { 'WAC-Allow': 'public="read"' }),
        );

        // Act
        const movie = (await Movie.find('solid://movies/spirited-away#it')) as Movie;

        // Assert
        expect(movie).toBeInstanceOf(Movie);
        expect(movie.url).toEqual('solid://movies/spirited-away#it');
        expect(movie.title).toEqual('Spirited Away');
        expect(movie.releaseDate?.getFullYear()).toEqual(2001);
        expect(movie.releaseDate?.getMonth()).toEqual(6);
        expect(movie.releaseDate?.getDate()).toEqual(20);
        expect(movie.isPublic).toEqual(true);
        expect(movie.isPrivate).toEqual(false);

        expect(movie.actions).toHaveLength(1);

        const action = movie.actions?.[0] as WatchAction;
        expect(action).toBeInstanceOf(WatchAction);
        expect(action.object).toEqual(movie.url);
        expect(action.startTime?.getFullYear()).toEqual(2020);
        expect(action.startTime?.getMonth()).toEqual(11);
        expect(action.startTime?.getDate()).toEqual(10);
    });

    it('Reads webIds', async () => {
        // Arrange
        FakeServer.respondOnce('*', fixture('alice.ttl'));

        // Act
        const alice = await Person.from('https://alice.pod-provider.com/profile/').find(
            'https://alice.pod-provider.com/profile/card#me',
        );

        // Assert
        expect(alice).not.toBeNull();
        expect(alice?.name).toEqual('Alice');
    });

    it('Reads many models from containers', async () => {
        // Arrange
        FakeServer.respondOnce('*', fixture('movies-container.ttl'));
        FakeServer.respondOnce('*', fixture('the-lord-of-the-rings.ttl'));
        FakeServer.respondOnce('*', fixture('spirited-away.ttl'));
        FakeServer.respondOnce('*', fixture('the-tale-of-princess-kaguya.ttl'));
        FakeServer.respondOnce('*', fixture('ramen.ttl'));

        // Act
        const movies = await Movie.all({ rating: 'PG' });

        // Assert
        expect(movies).toHaveLength(2);
        const theTaleOfPrincessKaguya = movies.find((movie) =>
            movie.url.endsWith('the-tale-of-princess-kaguya#it')) as Movie;
        const spiritedAway = movies.find((movie) => movie.url.endsWith('spirited-away#it')) as Movie;

        expect(theTaleOfPrincessKaguya).not.toBeUndefined();
        expect(theTaleOfPrincessKaguya.title).toEqual('The Tale of The Princess Kaguya');
        expect(theTaleOfPrincessKaguya.actions).toHaveLength(0);

        expect(spiritedAway).not.toBeUndefined();
        expect(spiritedAway.title).toEqual('Spirited Away');
        expect(spiritedAway.actions).toHaveLength(1);
    });

    it('Reads many models from documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        FakeServer.respondOnce('*', fixture('movies-document.ttl'));

        // Act
        const movies = await Movie.all({ $in: [documentUrl] });

        // Assert
        expect(movies).toHaveLength(2);
        const spiritedAway = movies.find((movie) => movie.url.endsWith('#spirited-away')) as Movie;
        const theLordOfTheRings = movies.find((movie) => movie.url.endsWith('#the-lord-of-the-rings')) as Movie;

        expect(spiritedAway).not.toBeUndefined();
        expect(spiritedAway.title).toEqual('Spirited Away');
        expect(spiritedAway.actions).toHaveLength(1);

        expect(theLordOfTheRings).not.toBeUndefined();
        expect(theLordOfTheRings.title).toEqual('The Lord of the Rings: The Fellowship of the Ring');
        expect(theLordOfTheRings.actions).toHaveLength(0);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetchSpy.mock.calls[0]?.[0]).toEqual(documentUrl);
    });

    it('Deletes models', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const url = `${documentUrl}#it`;
        const movie = new Movie({ url }, true);

        FakeServer.respondOnce('*'); // GET to check if there are other models in document
        FakeServer.respondOnce('*'); // GET to see if document exists
        FakeServer.respondOnce('*'); // DELETE

        // Act
        await movie.delete();

        // Assert
        expect(movie.exists()).toBe(false);
        expect(movie.documentExists()).toBe(false);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetchSpy.mock.calls[2]?.[0]).toEqual(documentUrl);
        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.method).toEqual('DELETE');
    });

    it('Deletes models in existing documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const title = faker.lorem.sentence();
        const watchDate = new Date('2002-09-15T23:42:00Z');
        const movie = new Movie({ url: `${documentUrl}#movie`, title }, true);
        const action = new WatchAction({ url: `${documentUrl}#action`, startTime: watchDate }, true);

        movie.setRelationModels('actions', [action]);

        const documentTurtle = `
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
            @prefix schema: <https://schema.org/>.

            <#it> rdfs:label "Movies" .

            <#movie>
                a schema:Movie ;
                schema:name "${title}" .

            <#action>
                a schema:WatchAction ;
                schema:object <#movie> ;
                schema:startTime "${watchDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `;

        // TODO this could be improved to fetch only once
        FakeServer.respondOnce('*', documentTurtle); // Fetch document to see if it can be deleted entirely
        FakeServer.respondOnce('*', documentTurtle); // Fetch document under SolidClient.update to prepare PATCH
        FakeServer.respondOnce('*'); // PATCH document

        // Act
        await movie.delete();

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);

        expect(FakeServer.fetchSpy.mock.calls[2]?.[0]).toEqual(documentUrl);
        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.method).toEqual('PATCH');
        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/>.

                <#movie>
                    a schema:Movie ;
                    schema:name "${title}" .

                <#action>
                    a schema:WatchAction ;
                    schema:object <#movie> ;
                    schema:startTime "${watchDate.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            } ;
        `);
    });

    it('Deletes related models in existing documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const groupName = faker.lorem.sentence();
        const memberName = faker.lorem.sentence();
        const group = new Group(
            {
                url: `${documentUrl}#group`,
                name: groupName,
                memberUrls: [`${documentUrl}#member`],
            },
            true,
        );
        const member = new Person({ url: `${documentUrl}#member`, name: memberName }, true);

        group.setRelationModels('members', [member]);

        const documentTurtle = `
            @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
            @prefix foaf: <http://xmlns.com/foaf/0.1/>.

            <#it> rdfs:label "Groups" .

            <#group>
                a foaf:Group ;
                foaf:name "${groupName}" ;
                foaf:member <#member> .

            <#member>
                a foaf:Person ;
                foaf:name "${memberName}" .
        `;

        // TODO this could be improved to fetch only once
        FakeServer.respondOnce('*', documentTurtle); // Fetch document
        FakeServer.respondOnce('*'); // PATCH document

        // Act
        await group.relatedMembers.remove(member);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[0]).toEqual(documentUrl);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.method).toEqual('PATCH');
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/>.

                <#group> foaf:member <#member> .

                <#member>
                    a foaf:Person ;
                    foaf:name "${memberName}" .
            }
        `);
    });

});

async function createStub(title?: string): Promise<Movie> {
    const attributes = {
        title: title ?? faker.lorem.sentence(),
        externalUrls: ['https://example.org/foo', 'https://example.org/bar'],
        releaseDate: new Date(),
    };

    return tap(new Movie(attributes, true), async (stub) => {
        stub.mintUrl();
        stub.cleanDirty();

        const document = await RDFDocument.fromJsonLD(stub.toJsonLD());
        const turtle = RDFResourceProperty.toTurtle(document.properties, document.url);

        FakeServer.respondOnce('*', turtle);
    });
}
