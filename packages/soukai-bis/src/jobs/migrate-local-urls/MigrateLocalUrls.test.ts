import { faker } from '@noeldemartin/faker';
import { quadsToTurtle, turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { urlRoute } from '@noeldemartin/utils';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/lib/internals/urls';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import Movie from 'soukai-bis/testing/stubs/Movie';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { engine } from 'soukai-bis/testing/utils/engines';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';
import { describe, expect, it, vi } from 'vite-plus/test';

import MigrateLocalUrls from './MigrateLocalUrls';

describe('MigrateLocalUrls', () => {
    it('migrates files', async () => {
        // Arrange
        const movieDocumentUrl = fakeDocumentUrl({ containerUrl: Movie.defaultContainerUrl });
        const movieUrl = fakeResourceUrl({ documentUrl: movieDocumentUrl });
        const fileUrl = `${Movie.defaultContainerUrl}poster.png`;
        const remoteContainerUrl = fakeContainerUrl({ baseUrl: `https://${faker.internet.domainName()}` });
        const migratedFileUrl = `${remoteContainerUrl}poster.png`;

        await Movie.create({ url: movieUrl, title: 'Spirited Away' });
        await engine.writeFile(fileUrl, new Blob(['poster'], { type: 'image/png' }), {
            localChanges: fileLocalChanges(fileUrl, 'created'),
        });

        // Act
        await MigrateLocalUrls.run({
            migrations: { [Movie.defaultContainerUrl]: remoteContainerUrl },
        });

        // Assert
        const migratedDocumentUrl = movieDocumentUrl.replace(Movie.defaultContainerUrl, remoteContainerUrl);

        expect(await engine.getFile(fileUrl)).toBeNull();
        expect(await engine.getDocumentLocalChanges(fileUrl)).toBeNull();
        expect(await engine.getFile(migratedFileUrl)).toMatchObject({
            url: migratedFileUrl,
            containerUrl: remoteContainerUrl,
            mimeType: 'image/png',
        });
        expect(await (await engine.readFile(migratedFileUrl)).text()).toEqual('poster');
        expect(await engine.getDocumentLocalChanges(migratedFileUrl)).toEqual({
            resources: { [migratedFileUrl]: { createdAt: new Date() } },
        });
        expect(await engine.readDocumentIfExists(migratedDocumentUrl)).not.toBeNull();
        expect(JSON.stringify(engine.documents[remoteContainerUrl]?.graph)).not.toContain('poster.png');
    });

    it('migrates urls', async () => {
        // Arrange
        const movieDocumentUrl = fakeDocumentUrl({ containerUrl: Movie.defaultContainerUrl });
        const movieUrl = fakeResourceUrl({ documentUrl: movieDocumentUrl });
        const nestedMovieDocumentUrl = fakeDocumentUrl({
            containerUrl: fakeContainerUrl({ baseUrl: Movie.defaultContainerUrl }),
        });
        const nestedMovieUrl = fakeResourceUrl({ documentUrl: nestedMovieDocumentUrl });
        const remoteContainerUrl = fakeContainerUrl({
            baseUrl: `https://${faker.internet.domainName()}`,
        });

        await Movie.create({ url: movieUrl, title: 'The Phantom of Baker Street' });
        await Movie.create({ url: nestedMovieUrl, title: 'The Cat' });

        // Act
        await MigrateLocalUrls.run({
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

    it('migrates prefixes along with urls', async () => {
        // Arrange
        const localDocUrl = 'local://tasks/task-1';
        const remoteContainerUrl = 'https://alice.example.org/tasks/';
        const remoteDocUrl = 'https://alice.example.org/tasks/task-1';
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .

            <${localDocUrl}#it>
                a schema:Action ;
                schema:name "Buy milk" ;
                schema:actionStatus schema:CompletedActionStatus .

            <${localDocUrl}#op-1>
                a crdt:SetPropertyOperation ;
                crdt:resource <${localDocUrl}#it> ;
                crdt:property schema:name ;
                crdt:value "Buy milk" .

            <${localDocUrl}#op-type>
                a crdt:SetPropertyOperation ;
                crdt:resource <${localDocUrl}#it> ;
                crdt:property <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ;
                crdt:value schema:Action .
        `);

        await engine.createDocument(localDocUrl, quads);

        // Act
        await MigrateLocalUrls.run({
            migrations: { 'local://tasks/': remoteContainerUrl },
            prefixes: { 'https://schema.org/': 'http://schema.org/' },
        });

        // Assert
        const migrated = await engine.readDocument(remoteDocUrl);

        expect(quadsToTurtle(migrated.getQuads())).toEqualTurtle(`
            @prefix schema: <http://schema.org/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .

            <${remoteDocUrl}#it>
                a schema:Action ;
                schema:name "Buy milk" ;
                schema:actionStatus schema:CompletedActionStatus .

            <${remoteDocUrl}#op-1>
                a crdt:SetPropertyOperation ;
                crdt:resource <${remoteDocUrl}#it> ;
                crdt:property schema:name ;
                crdt:value "Buy milk" .

            <${remoteDocUrl}#op-type>
                a crdt:SetPropertyOperation ;
                crdt:resource <${remoteDocUrl}#it> ;
                crdt:property <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ;
                crdt:value schema:Action .
        `);
    });

    it('rewrites prefixes in place for documents that do not move', async () => {
        // Arrange
        const taskDocUrl = 'local://tasks/task-1';
        const noteDocUrl = 'local://notes/note-1';
        const dataUrl = 'https://schema.org.example.org/resource';

        await engine.createDocument(
            taskDocUrl,
            await turtleToQuads(`
                @prefix schema: <https://schema.org/> .

                <${taskDocUrl}#it>
                    a schema:Action ;
                    schema:name "Task" ;
                    schema:sameAs <${dataUrl}> .
            `),
        );
        await engine.createDocument(
            noteDocUrl,
            await turtleToQuads(`
                @prefix schema: <https://schema.org/> .

                <${noteDocUrl}#it>
                    a schema:Note ;
                    schema:text "Note" .
            `),
        );

        // Act - only prefixes, no migrations
        await MigrateLocalUrls.run({
            prefixes: { 'https://schema.org/': 'http://schema.org/' },
        });

        // Assert - both documents rewritten in place, data url untouched, containers not dropped
        const taskDoc = await engine.readDocument(taskDocUrl);
        const noteDoc = await engine.readDocument(noteDocUrl);

        expect(quadsToTurtle(taskDoc.getQuads())).toEqualTurtle(`
            @prefix schema: <http://schema.org/> .

            <${taskDocUrl}#it>
                a schema:Action ;
                schema:name "Task" ;
                schema:sameAs <${dataUrl}> .
        `);
        expect(quadsToTurtle(noteDoc.getQuads())).toEqualTurtle(`
            @prefix schema: <http://schema.org/> .

            <${noteDocUrl}#it>
                a schema:Note ;
                schema:text "Note" .
        `);
    });

    it('migrates local changes', async () => {
        // Arrange

        trackLocalChanges(WatchAction);

        const action = await WatchAction.create({ startTime: new Date() });
        const remoteContainerUrl = fakeContainerUrl({ baseUrl: 'https://my-pod.com/' });

        vi.advanceTimersByTime(1000);
        await action.update({ startTime: new Date() });

        // Act
        await MigrateLocalUrls.run({
            migrations: { [WatchAction.defaultContainerUrl]: remoteContainerUrl },
        });

        // Assert
        const migratedUrl = action.url.replace(WatchAction.defaultContainerUrl, remoteContainerUrl);
        const localChanges = await engine.getDocumentLocalChanges(urlRoute(migratedUrl));
        const resourceChanges = localChanges?.resources[migratedUrl];
        const operationUrls = resourceChanges?.newOperations ?? [];

        expect(Object.keys(await engine.getDocumentsLocalChanges())).toEqual([urlRoute(migratedUrl)]);
        expect(resourceChanges?.createdAt).toBeInstanceOf(Date);
        expect(operationUrls).toHaveLength(1);
        expect(operationUrls[0]?.startsWith(migratedUrl)).toBe(true);
    });

    function fixture<T = string>(name: string, replacements: Record<string, string> = {}): T {
        return loadFixture<T>(new URL(`./testing/fixtures/${name}`, import.meta.url), replacements);
    }
});
