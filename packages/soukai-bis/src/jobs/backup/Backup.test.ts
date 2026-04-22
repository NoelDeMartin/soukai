import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import Movie from 'soukai-bis/testing/stubs/Movie';
import { setEngine } from 'soukai-bis/engines/state';

import Backup from './Backup';
import type { BackupConfig } from './Backup';

describe('Backup', () => {

    let localEngine: InMemoryEngine;
    let remoteEngine: SolidEngine;
    let config: Pick<BackupConfig, 'localEngine' | 'remoteEngine'>;

    beforeEach(() => {
        localEngine = new InMemoryEngine();
        remoteEngine = new SolidEngine({ fetch: FakeServer.fetch });
        config = {
            localEngine,
            remoteEngine,
        };

        setEngine(localEngine);
    });

    it('backs up local documents', async () => {
        // Arrange
        const movieDocumentUrl = fakeDocumentUrl({ containerUrl: Movie.defaultContainerUrl });
        const movieUrl = fakeResourceUrl({ documentUrl: movieDocumentUrl });
        const remoteContainerUrl = fakeContainerUrl();

        await Movie.create({ url: movieUrl, title: 'The Phantom of Baker Street' });

        FakeServer.respondOnce('*', FakeResponse.notFound());
        FakeServer.respondOnce('*', FakeResponse.success());

        // Act
        await Backup.run({
            ...config,
            urlMigrations: {
                [Movie.defaultContainerUrl]: remoteContainerUrl,
            },
        });

        // Assert
        const remoteDocumentUrl = movieDocumentUrl.replace(Movie.defaultContainerUrl, remoteContainerUrl);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, remoteDocumentUrl, expect.anything());

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a schema:Movie ;
                    schema:name "The Phantom of Baker Street" .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "[[.*]]"^^xsd:dateTime ;
                    crdt:updatedAt "[[.*]]"^^xsd:dateTime .
            }
        `);

        await expect(localEngine.readDocument(movieDocumentUrl)).rejects.toThrow(DocumentNotFound);
    });

});
