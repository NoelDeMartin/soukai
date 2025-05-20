import { beforeAll, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl } from '@noeldemartin/testing';
import { InMemoryEngine, bootModels, setEngine } from 'soukai';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import MoviesCollection from 'soukai-solid/testing/lib/stubs/MoviesCollection';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import PersonsCollection from 'soukai-solid/testing/lib/stubs/PersonsCollection';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import { SolidModel } from 'soukai-solid/models/SolidModel';
import { solidModelWithHistory } from 'soukai-solid/testing/utils';
import { SolidEngine } from 'soukai-solid/engines';

describe('SolidContainsRelation', () => {

    beforeAll(() => bootModels({ MoviesCollection, Movie, PersonsCollection, Person }));

    it('creates related models for solid engines', async () => {
        // Arrange
        const parentContainerUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentContainerUrl });
        const movieTitle = faker.lorem.sentence();
        const collection = new MoviesCollection({ url: containerUrl }, true);

        collection.relatedMovies.related = [];

        FakeSolidEngine.use();

        // Act
        const movie = await collection.relatedMovies.create({ title: movieTitle });

        // Assert
        expect(collection.resourceUrls).toHaveLength(1);
        expect(collection.movies).toHaveLength(1);
        expect(collection.resourceUrls[0]).toEqual(movie.getDocumentUrl());
        expect(collection.movies?.[0]).toEqual(movie);
        expect(movie.exists()).toBe(true);
        expect(movie.url.startsWith(collection.url)).toBe(true);
        expect(movie.title).toEqual(movieTitle);
        expect(movie.collection).toBe(collection);
        expect(FakeSolidEngine.update).not.toHaveBeenCalled();
    });

    it('creates related models for non-solid engines', async () => {
        // Arrange
        setEngine(new InMemoryEngine());

        const movieTitle = faker.lorem.sentence();
        const collection = await MoviesCollection.create({ url: fakeContainerUrl() });

        // Act
        const movie = await collection.relatedMovies.create({ title: movieTitle });

        // Assert
        expect(collection.resourceUrls).toHaveLength(1);
        expect(collection.movies).toHaveLength(1);
        expect(collection.resourceUrls[0]).toEqual(movie.getDocumentUrl());
        expect(collection.movies?.[0]).toEqual(movie);
        expect(movie.exists()).toBe(true);
        expect(movie.url.startsWith(collection.url)).toBe(true);
        expect(movie.title).toEqual(movieTitle);
        expect(movie.collection).toBe(collection);

        const freshCollection = await collection.fresh();
        expect(freshCollection.resourceUrls).toHaveLength(1);
        expect(freshCollection.resourceUrls[0]).toEqual(movie.getDocumentUrl());
    });

    it('works without inverse relation', async () => {
        // Arrange
        setEngine(new InMemoryEngine());

        const personName = faker.lorem.sentence();
        const collection = await PersonsCollection.create({ url: fakeContainerUrl() });

        // Act
        const person = await collection.relatedPersons.create({ name: personName });

        // Assert
        expect(collection.resourceUrls).toHaveLength(1);
        expect(collection.persons).toHaveLength(1);
        expect(collection.resourceUrls[0]).toEqual(person.getDocumentUrl());
        expect(collection.persons?.[0]).toEqual(person);
        expect(person.exists()).toBe(true);
        expect(person.url.startsWith(collection.url)).toBe(true);
        expect(person.name).toEqual(personName);

        const freshCollection = await collection.fresh();
        expect(freshCollection.resourceUrls).toHaveLength(1);
        expect(freshCollection.resourceUrls[0]).toEqual(person.getDocumentUrl());
    });

    it('busts related models cache', async () => {
        // Arrange
        setEngine(new InMemoryEngine());

        const collection = await MoviesCollection.create({ url: fakeContainerUrl() });
        const initialRelated = collection.getRelatedModels();

        // Act
        await collection.relatedMovies.create({ title: faker.lorem.sentence() });

        // Assert
        const related = collection.getRelatedModels();

        expect(initialRelated).toHaveLength(1);
        expect(related).toHaveLength(2);
    });

    it('synchronizes models using different engines', async () => {
        // Arrange
        bootModels({ MoviesCollectionWithHistory });
        setEngine(new InMemoryEngine());

        const collectionA = await MoviesCollectionWithHistory.create({ url: fakeContainerUrl(), name: 'Movies' });
        const movie = await collectionA.relatedMovies.create({ title: faker.lorem.sentence() });
        const collectionB = new MoviesCollectionWithHistory(
            {
                url: collectionA.url,
                name: 'Movies',
                resourceUrls: [movie.getDocumentUrl()],
            },
            true,
        );

        collectionB.setEngine(new SolidEngine());
        collectionB.setRelationModels('operations', []);

        // Act
        await SolidModel.synchronize(collectionA, collectionB);

        // Assert
        expect(collectionA.resourceUrls).toHaveLength(1);
        expect(collectionB.resourceUrls).toHaveLength(1);
    });

});

class MoviesCollectionWithHistory extends solidModelWithHistory(MoviesCollection) {}
