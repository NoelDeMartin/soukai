import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { quadsToTurtle } from '@noeldemartin/solid-utils';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { setEngine } from 'soukai-bis/engines/state';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';

import MigrateUrls from './MigrateUrls';
import type { MigrateUrlsConfig } from './MigrateUrls';

const fixture = <T = string>(name: string, replacements: Record<string, string> = {}) =>
    loadFixture<T>(new URL(`./MigrateUrls.test.ts-fixtures/${name}`, import.meta.url), replacements);

describe('MigrateUrls', () => {

    let engine: InMemoryEngine;
    let config: Pick<MigrateUrlsConfig, 'engine'>;

    beforeEach(() => {
        engine = new InMemoryEngine();
        config = { engine };

        setEngine(engine);
    });

    it('migrates urls', async () => {
        // Arrange
        const movieDocumentUrl = fakeDocumentUrl({ containerUrl: Movie.defaultContainerUrl });
        const movieUrl = fakeResourceUrl({ documentUrl: movieDocumentUrl });
        const nestedMovieDocumentUrl = fakeDocumentUrl({
            containerUrl: fakeContainerUrl({ baseUrl: Movie.defaultContainerUrl }),
        });
        const nestedMovieUrl = fakeResourceUrl({ documentUrl: nestedMovieDocumentUrl });
        const remoteContainerUrl = fakeContainerUrl();

        await Movie.create({ url: movieUrl, title: 'The Phantom of Baker Street' });
        await Movie.create({ url: nestedMovieUrl, title: 'The Cat' });

        // Act
        await MigrateUrls.run({
            ...config,
            migrations: {
                [Movie.defaultContainerUrl]: remoteContainerUrl,
            },
        });

        // Assert
        const migratedDocumentUrl = movieDocumentUrl.replace(Movie.defaultContainerUrl, remoteContainerUrl);
        const migratedDocument = await engine.readDocument(migratedDocumentUrl);
        const migratedNestedDocumentUrl = nestedMovieDocumentUrl.replace(Movie.defaultContainerUrl, remoteContainerUrl);
        const migratedNestedDocument = await engine.readDocument(migratedNestedDocumentUrl);

        expect(quadsToTurtle(migratedDocument.getQuads())).toEqualTurtle(
            fixture('movie.ttl', {
                documentUrl: migratedDocumentUrl,
                title: 'The Phantom of Baker Street',
            }),
        );

        expect(quadsToTurtle(migratedNestedDocument.getQuads())).toEqualTurtle(
            fixture('movie.ttl', {
                documentUrl: migratedNestedDocumentUrl,
                title: 'The Cat',
            }),
        );

        await expect(engine.readDocument(movieDocumentUrl)).rejects.toThrow(DocumentNotFound);
        await expect(engine.readDocument(nestedMovieDocumentUrl)).rejects.toThrow(DocumentNotFound);
    });

});
