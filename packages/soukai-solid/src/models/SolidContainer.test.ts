import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { FieldType, bootModels } from 'soukai';
import { stringToSlug, urlResolve, urlResolveDirectory } from '@noeldemartin/utils';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import type { EngineDocument } from 'soukai';
import type { Tuple } from '@noeldemartin/utils';

import IRI from 'soukai-solid/solid/utils/IRI';
import { LDP_CONTAINER } from 'soukai-solid/solid/constants';

import {
    stubMovieJsonLD,
    stubMoviesCollectionJsonLD,
    stubSolidDocumentJsonLD,
} from 'soukai-solid/testing/lib/stubs/helpers';
import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';
import MoviesCollection from 'soukai-solid/testing/lib/stubs/MoviesCollection';

import SolidContainer from './SolidContainer';
import SolidDocument from './SolidDocument';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';

describe('SolidContainer', () => {

    beforeAll(() => bootModels({ Movie, MoviesCollection, WatchAction }));
    beforeEach(() => FakeSolidEngine.use());

    it('adds ldp:Container rdfsClass', () => {
        class StubModel extends SolidContainer {}

        bootModels({ StubModel });

        expect(StubModel.rdfsClasses).toEqual([LDP_CONTAINER]);
    });

    it('adds resourceUrls field', () => {
        // Arrange
        class StubModel extends SolidContainer {

            public static timestamps = false;
        
        }

        // Act
        bootModels({ StubModel });

        // Assert
        expect(StubModel.fields).toEqual({
            url: {
                type: FieldType.Key,
                required: false,
            },
            name: {
                type: FieldType.String,
                required: false,
                rdfProperty: IRI('rdfs:label'),
                rdfPropertyAliases: [],
            },
            description: {
                type: FieldType.String,
                required: false,
                rdfProperty: IRI('rdfs:comment'),
                rdfPropertyAliases: [],
            },
            resourceUrls: {
                type: FieldType.Array,
                required: false,
                rdfProperty: IRI('ldp:contains'),
                rdfPropertyAliases: [],
                items: {
                    type: FieldType.Key,
                },
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
                rdfProperty: IRI('purl:created'),
                rdfPropertyAliases: [],
            },
            updatedAt: {
                type: FieldType.Date,
                required: false,
                rdfProperty: IRI('purl:modified'),
                rdfPropertyAliases: [],
            },
        });
    });

    it('adds documents relation', async () => {
        // Arrange
        const parentContainerUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentContainerUrl });
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl });

        FakeSolidEngine.database[parentContainerUrl] = {
            [containerUrl]: {
                '@graph': [
                    stubMoviesCollectionJsonLD(containerUrl, faker.lorem.word(), [firstDocumentUrl, secondDocumentUrl])[
                        '@graph'
                    ][0],
                    stubSolidDocumentJsonLD(firstDocumentUrl, '1997-07-21T23:42:00.000Z')['@graph'][0],
                    stubSolidDocumentJsonLD(secondDocumentUrl, '2010-02-15T23:42:00.000Z')['@graph'][0],
                ],
            } as EngineDocument,
        };

        // Act
        const collection = (await MoviesCollection.find(containerUrl)) as MoviesCollection;

        // Assert
        const documents = collection.documents as Tuple<SolidDocument, 2>;

        expect(collection.documents).toHaveLength(2);

        expect(documents[0].url).toEqual(firstDocumentUrl);
        expect(documents[0].updatedAt).toEqual(new Date('1997-07-21T23:42:00.000Z'));

        expect(documents[1].url).toEqual(secondDocumentUrl);
        expect(documents[1].updatedAt).toEqual(new Date('2010-02-15T23:42:00.000Z'));
    });

    it('implements contains relationship', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const theLordOfTheRingsUrl = urlResolve(containerUrl, 'the-lord-of-the-rings');
        const spiritedAwayUrl = urlResolve(containerUrl, 'spirited-away');
        const collection = new MoviesCollection({
            url: containerUrl,
            resourceUrls: [theLordOfTheRingsUrl, spiritedAwayUrl],
        });

        collection.setRelationModels('documents', [
            new SolidDocument({ url: theLordOfTheRingsUrl }),
            new SolidDocument({ url: spiritedAwayUrl }),
        ]);

        FakeSolidEngine.database[containerUrl] = {
            [theLordOfTheRingsUrl]: stubMovieJsonLD(theLordOfTheRingsUrl, 'The Lord Of The Rings'),
            [spiritedAwayUrl]: stubMovieJsonLD(spiritedAwayUrl, 'Spirited Away'),
        };

        expect(collection.movies).toBeUndefined();

        // Act
        await collection.loadRelation('movies');

        // Assert
        const collectionMovies = collection.movies as Tuple<Movie, 2>;
        expect(collectionMovies).toHaveLength(2);
        expect(collectionMovies[0]).toBeInstanceOf(Movie);
        expect(collectionMovies[0].url).toBe(theLordOfTheRingsUrl);
        expect(collectionMovies[0].title).toBe('The Lord Of The Rings');
        expect(collectionMovies[1]).toBeInstanceOf(Movie);
        expect(collectionMovies[1].url).toBe(spiritedAwayUrl);
        expect(collectionMovies[1].title).toBe('Spirited Away');

        expect(FakeSolidEngine.readMany).toHaveBeenCalledTimes(1);
        expect(FakeSolidEngine.readMany).toHaveBeenCalledWith(containerUrl, {
            '$in': [theLordOfTheRingsUrl, spiritedAwayUrl],
            '@graph': {
                $contains: {
                    '@type': {
                        $or: [
                            { $contains: ['Movie'] },
                            { $contains: [IRI('schema:Movie')] },
                            { $eq: 'Movie' },
                            { $eq: IRI('schema:Movie') },
                        ],
                    },
                },
            },
        });
    });

    it('uses name for minting url for new containers', async () => {
        // Arrange
        class StubModel extends SolidContainer {

            public static rdfContexts = {
                foaf: 'http://xmlns.com/foaf/0.1/',
            };
        
        }

        const containerUrl = fakeContainerUrl();
        const name = faker.random.word();

        bootModels({ StubModel });

        // Act
        const model = await StubModel.at(containerUrl).create({ name });

        // Assert
        expect(typeof model.url).toEqual('string');
        expect(model.url).toEqual(urlResolveDirectory(containerUrl, stringToSlug(name)));

        expect(FakeSolidEngine.create).toHaveBeenCalledWith(containerUrl, expect.anything(), model.url);
    });

    it('overrides slugField', async () => {
        // Arrange
        class StubModel extends SolidContainer {

            public static slugField = 'label';

            public static rdfContexts = {
                rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            };
        
        }

        const containerUrl = fakeContainerUrl();
        const label = faker.random.word();

        bootModels({ StubModel });

        // Act
        const model = await StubModel.at(containerUrl).create({ label });

        // Assert
        expect(typeof model.url).toEqual('string');
        expect(model.url).toEqual(urlResolveDirectory(containerUrl, stringToSlug(label)));

        expect(FakeSolidEngine.create).toHaveBeenCalledWith(containerUrl, expect.anything(), model.url);
    });

    it('mints unique urls when urls are already in use', async () => {
        class StubModel extends SolidContainer {

            public static rdfContexts = {
                foaf: 'http://xmlns.com/foaf/0.1/',
            };
        
        }

        const name = faker.random.word();
        const slug = stringToSlug(name);
        const containerUrl = fakeContainerUrl();
        const escapedContainerUrl = containerUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const resourceUrl = urlResolveDirectory(containerUrl, slug);

        FakeSolidEngine.database[containerUrl] = {
            [resourceUrl]: { url: resourceUrl },
        };

        bootModels({ StubModel });

        // Act
        const model = await StubModel.at(containerUrl).create({ name });

        // Assert
        expect(typeof model.url).toEqual('string');
        expect(model.url).not.toEqual(resourceUrl);
        expect(model.url).toMatch(new RegExp(`^${escapedContainerUrl}${slug}-[\\d\\w-]+/$`));

        expect(FakeSolidEngine.create).toHaveBeenCalledWith(containerUrl, expect.anything(), resourceUrl);
        expect(FakeSolidEngine.create).toHaveBeenCalledWith(containerUrl, expect.anything(), model.url);
    });

    it('empty documents relation gets initialized', async () => {
        const collection = (await MoviesCollection.create({ name: faker.random.word() })) as MoviesCollection;

        expect(collection.isRelationLoaded('documents')).toBe(true);
        expect(collection.documents).toEqual([]);
    });

});
