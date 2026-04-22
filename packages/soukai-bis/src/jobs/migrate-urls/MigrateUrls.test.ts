import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { setEngine } from 'soukai-bis/engines/state';

import MigrateUrls from './MigrateUrls';
import type { MigrateUrlsConfig } from './MigrateUrls';
import { quadsToTurtle } from '@noeldemartin/solid-utils';

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
        const remoteContainerUrl = fakeContainerUrl();

        await Movie.create({ url: movieUrl, title: 'The Phantom of Baker Street' });

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

        expect(quadsToTurtle(migratedDocument.getQuads())).toEqualTurtle(`
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <${migratedDocumentUrl}#it>
                a schema:Movie ;
                schema:name "The Phantom of Baker Street" .

            <${migratedDocumentUrl}#it-metadata>
                a crdt:Metadata ;
                crdt:resource <${migratedDocumentUrl}#it> ;
                crdt:createdAt "[[.*]]"^^xsd:dateTime ;
                crdt:updatedAt "[[.*]]"^^xsd:dateTime .
        `);

        await expect(engine.readDocument(movieDocumentUrl)).rejects.toThrow(DocumentNotFound);
    });

});
