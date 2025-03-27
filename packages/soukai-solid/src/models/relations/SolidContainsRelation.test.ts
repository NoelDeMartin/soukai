import { beforeAll, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { fakeContainerUrl } from '@noeldemartin/testing';
import { InMemoryEngine, bootModels, setEngine } from 'soukai';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import MoviesCollection from 'soukai-solid/testing/lib/stubs/MoviesCollection';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import PersonsCollection from 'soukai-solid/testing/lib/stubs/PersonsCollection';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';

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

});
