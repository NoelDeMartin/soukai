import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';
import { quadsToTurtle } from '@noeldemartin/solid-utils';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { setEngine } from 'soukai-bis/engines/state';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/utils/urls';

import MigrateLocalUrls from './MigrateLocalUrls';
import type { MigrateLocalUrlsConfig } from './MigrateLocalUrls';

const fixture = <T = string>(name: string, replacements: Record<string, string> = {}) =>
    loadFixture<T>(new URL(`./MigrateLocalUrls.test.ts-fixtures/${name}`, import.meta.url), replacements);

describe('MigrateLocalUrls', () => {

    let engine: InMemoryEngine;
    let config: Pick<MigrateLocalUrlsConfig, 'engine'>;

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
        const remoteContainerUrl = fakeContainerUrl({ baseUrl: `https://${faker.internet.domainName()}` });

        await Movie.create({ url: movieUrl, title: 'The Phantom of Baker Street' });
        await Movie.create({ url: nestedMovieUrl, title: 'The Cat' });

        // Act
        await MigrateLocalUrls.run({
            ...config,
            migrations: {
                [Movie.defaultContainerUrl]: remoteContainerUrl,
            },
        });

        // Assert
        const engineContainerUrls = Object.keys(engine.documents);
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

        expect(engineContainerUrls).toHaveLength(6);
        expect(engineContainerUrls).toEqual(
            expect.arrayContaining([
                'https://',
                migratedDocumentUrl,
                migratedNestedDocumentUrl,
                safeContainerUrl(migratedDocumentUrl),
                safeContainerUrl(migratedNestedDocumentUrl),
                safeContainerUrl(requireSafeContainerUrl(migratedDocumentUrl)),
            ]),
        );
    });

});
