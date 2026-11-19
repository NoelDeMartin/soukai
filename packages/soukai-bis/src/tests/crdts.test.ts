import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { InMemoryEngine, setEngine } from 'soukai-bis/engines';
import MoviesCollection from 'soukai-bis/testing/stubs/MoviesCollectionWithHistory';
import User from 'soukai-bis/testing/stubs/UserWithHistory';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import { describe, expect, it, vi } from 'vite-plus/test';

describe('CRDTs', () => {
    useSolidEngine();

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
        const griffith = await User.create({ name: 'Griffith' });

        vi.advanceTimersByTime(1);
        await griffith.update({ name: 'Femto', givenName: 'Wings of Darkness', lastName: null });
        vi.advanceTimersByTime(1);
        await griffith.update({ name: 'Griffith', givenName: 'Falcon of Light' });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(fixture('create-griffith.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('update-griffith-1.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[5]?.[1]?.body).toEqualSparql(fixture('update-griffith-2.sparql'));
    });

    it('Loads existing operations before updating', async () => {
        // Arrange
        setEngine(new InMemoryEngine());

        const griffith = await User.create({ name: 'Griffith' });

        vi.advanceTimersByTime(1);
        await griffith.update({ name: 'Femto' });

        const freshGriffith = await User.findOrFail(griffith.url);
        const isLoadedByDefault = freshGriffith.isRelationLoaded('operations');

        // Act
        vi.advanceTimersByTime(1);
        await freshGriffith.update({ name: 'Griffith' });

        // Assert
        const operations = await (await User.findOrFail(griffith.url)).loadRelation('operations');

        expect(isLoadedByDefault).toBe(false);
        expect(operations).toHaveLength(3);
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
        vi.advanceTimersByTime(1);
        await movies.update({ name: 'Great Movies' });

        // Assert
        expect(movies.name).toEqual('Great Movies');

        expect(FakeServer.fetch).toHaveBeenCalledTimes(7);

        expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(fixture('create-movies.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[6]?.[1]?.body).toEqualSparql(fixture('update-movies.sparql'));
    });

    function fixture<T = string>(name: string): T {
        return loadFixture<T>(`crdts/${name}`);
    }
});
