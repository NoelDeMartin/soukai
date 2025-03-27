import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEngine, bootModels, setEngine } from 'soukai';
import { tap } from '@noeldemartin/utils';
import { faker } from '@noeldemartin/faker';
import type { EngineDocument, InMemoryEngineCollection } from 'soukai';

import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import Task from 'soukai-solid/testing/lib/stubs/Task';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';

let engine: InMemoryEngine;

describe('Soukai CRUD', () => {

    beforeEach(() => {
        engine = new InMemoryEngine();

        setEngine(engine);
        bootModels({ Movie, Task, WatchAction });
    });

    it('Creates models', async () => {
        // Arrange
        const title = faker.lorem.sentence();

        // Act
        const movie = await Movie.create({ title });

        // Assert
        expect(movie.title).toBe(title);

        await expect(engine.database[Movie.collection]?.[movie.requireDocumentUrl()]).toEqualJsonLD({
            '@graph': [
                {
                    '@context': { '@vocab': 'https://schema.org/' },
                    '@id': movie.url,
                    '@type': 'Movie',
                    'name': title,
                },
            ],
        });
    });

    it('Reads models', async () => {
        // Arrange
        const title = faker.lorem.sentence();
        const stub = createStub(title);

        // Act
        const movie = (await Movie.find(stub.url)) as Movie;

        // Assert
        expect(movie).not.toBeNull();
        expect(movie.title).toEqual(title);
    });

    it('Updates models', async () => {
        // Arrange
        const title = faker.lorem.sentence();
        const stub = createStub(faker.lorem.sentence());
        const movie = new Movie(stub.getAttributes(), true);

        // Act
        await movie.update({ title });

        // Assert
        expect(movie.title).toBe(title);

        await expect(engine.database[Movie.collection]?.[stub.requireDocumentUrl()]).toEqualJsonLD({
            '@graph': [
                {
                    '@context': { '@vocab': 'https://schema.org/' },
                    '@id': stub.url,
                    '@type': 'Movie',
                    'name': title,
                },
            ],
        });
    });

    it('Adds new fields', async () => {
        // Arrange
        const task = await Task.create({ name: 'testing' });

        // Act
        await task.update({ important: true });

        // Assert
        const freshTask = await task.fresh();

        expect(freshTask.important).toBe(true);
    });

    it('Deletes models', async () => {
        // Arrange
        const stub = createStub();
        const movie = new Movie(stub.getAttributes(), true);

        // Act
        await movie.delete();

        // Assert
        expect(movie.exists()).toBe(false);
        expect(Object.values(engine.database[Movie.collection] as InMemoryEngineCollection)).toHaveLength(0);
    });

});

function createStub(title?: string): Movie {
    return tap(new Movie({ title: title ?? faker.lorem.sentence() }), (stub) => {
        stub.mintUrl();

        engine.database[Movie.collection] = {
            [stub.requireDocumentUrl()]: {
                '@graph': [stub.toJsonLD()],
            } as EngineDocument,
        };
    });
}
