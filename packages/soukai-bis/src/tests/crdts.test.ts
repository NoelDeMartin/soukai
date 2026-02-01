import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';

import BaseMoviesCollection from 'soukai-bis/testing/stubs/MoviesCollection';
import BasePerson from 'soukai-bis/testing/stubs/Person';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import { setEngine } from 'soukai-bis/engines';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';

const fixture = <T = string>(name: string) => loadFixture<T>(`crdts/${name}`);
const Person = defineSchema(BasePerson, { history: true });
const MoviesCollection = defineSchema(BaseMoviesCollection, {
    history: true,
    timestamps: true,
});

describe('CRDTs', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Person, MoviesCollection }, true);
    });

    it('Updates metadata and creates operations', async () => {
        // Arrange - stub create requests
        FakeServer.respondOnce('*', FakeResponse.notFound());
        FakeServer.respondOnce('*', FakeResponse.success());

        // Arrange - stub first update requests
        FakeServer.respondOnce('*', FakeResponse.success(fixture('griffith-1.ttl')));
        FakeServer.respondOnce('*', FakeResponse.success());

        // Arrange - stub second update requests
        FakeServer.respondOnce('*', FakeResponse.success(fixture('griffith-2.ttl')));
        FakeServer.respondOnce('*', FakeResponse.success());

        // Act
        const griffith = await Person.create({ name: 'Griffith' });

        await griffith.update({ name: 'Femto', givenName: 'Wings of Darkness', lastName: null });
        await griffith.update({ name: 'Griffith', givenName: 'Falcon of Light' });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(fixture('create-griffith.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('update-griffith-1.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[5]?.[1]?.body).toEqualSparql(fixture('update-griffith-2.sparql'));
    });

    it('Works with containers', async () => {
        // Arrange - Create
        FakeServer.respondOnce('*', FakeResponse.notFound()); // Check if container exists
        FakeServer.respondOnce('*', FakeResponse.success()); // Create container
        FakeServer.respondOnce('*', FakeResponse.success()); // Update container .meta

        // Arrange - Add document
        FakeServer.respondOnce('*', FakeResponse.notFound()); // Check if movie exists
        FakeServer.respondOnce('*', FakeResponse.success()); // Create movie

        // Arrange - Update name
        FakeServer.respondOnce('*', FakeResponse.success(fixture('movies.ttl'))); // Get container
        FakeServer.respondOnce('*', FakeResponse.success()); // Update container

        // Act - Create
        const movies = await MoviesCollection.create({ name: 'Movies' });

        // Act - Add document
        await movies.relatedMovies.create({ title: 'Spirited Away' });

        // Act - Update name
        await movies.update({ name: 'Great Movies' });

        // Assert
        expect(movies.name).toEqual('Great Movies');

        expect(FakeServer.fetch).toHaveBeenCalledTimes(7);

        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(fixture('create-movies.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[6]?.[1]?.body).toEqualSparql(fixture('update-movies.sparql'));
    });

});
