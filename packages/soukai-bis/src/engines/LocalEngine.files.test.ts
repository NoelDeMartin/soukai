import { RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import { LDP_CONTAINS_PREDICATE, RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';
import InMemoryEngine from './InMemoryEngine';
import { fileLocalChanges } from './local-changes';
import type LocalEngine from './LocalEngine';

describe.each([
    ['InMemoryEngine', () => new InMemoryEngine()],
    ['IndexedDBEngine', () => new IndexedDBEngine()],
] as const)('%s files', (engineName, createEngine) => {
    let engine: LocalEngine;

    beforeEach(async () => {
        engine = createEngine();

        if (engineName === 'IndexedDBEngine') {
            await SoukaiIndexedDB.clear();
        }
    });

    afterEach(async () => {
        if (engine instanceof IndexedDBEngine) {
            await engine.close();
            await SoukaiIndexedDB.clear();
        }
    });

    it('writes and reads files', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;
        const blob = new Blob(['page'], { type: 'image/png' });

        // Act
        await engine.writeFile(fileUrl, blob);

        // Assert
        const file = await engine.getFile(fileUrl);
        const storedBlob = await engine.readFile(fileUrl);

        expect(file).toMatchObject({ url: fileUrl, containerUrl, mimeType: 'image/png' });
        expect(await storedBlob.text()).toEqual('page');
    });

    it('lists files in containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const fileUrl = `${containerUrl}001.png`;

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('schema:ComicIssue'),
        });
        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Act
        const container = await engine.readDocument(containerUrl);
        const documents = await engine.readDocuments({ containerUrl });

        // Assert
        for (const containerDocument of [container, documents[containerUrl]]) {
            const containedUrls = containerDocument
                ?.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value);

            expect(containedUrls).toEqual(expect.arrayContaining([documentUrl, fileUrl]));
            expect(
                containerDocument
                    ?.statements(new RDFNamedNode(fileUrl), RDF_TYPE_PREDICATE)
                    .map((quad) => quad.object.value),
            ).toEqual(
                expect.arrayContaining([
                    expandIRI('ldp:Resource'),
                    'http://www.w3.org/ns/iana/media-types/image/png#Resource',
                ]),
            );
        }

        expect(documents[fileUrl]).toBeUndefined();
    });

    it('fails creating existing files', async () => {
        // Arrange
        const fileUrl = `${fakeContainerUrl()}001.png`;

        await engine.createFile(fileUrl, new Blob(['first']));

        // Act & Assert
        await expect(engine.createFile(fileUrl, new Blob(['second']))).rejects.toThrow(FileAlreadyExists);
        expect(await (await engine.readFile(fileUrl)).text()).toEqual('first');
    });

    it('tracks local changes', async () => {
        // Arrange
        const fileUrl = `${fakeContainerUrl()}001.png`;

        // Act
        await engine.writeFile(fileUrl, new Blob(['page']), { localChanges: fileLocalChanges(fileUrl, 'created') });

        // Assert
        expect(await engine.getDocumentLocalChanges(fileUrl)).toEqual({
            resources: { [fileUrl]: { state: 'created' } },
        });
        expect(await engine.getDocumentsLocalChanges()).toHaveProperty(fileUrl);
    });

    it('deletes files created locally', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page']), { localChanges: fileLocalChanges(fileUrl, 'created') });

        // Act
        await engine.deleteFile(fileUrl, { localChanges: fileLocalChanges(fileUrl, 'deleted') });

        // Assert
        expect(await engine.getFile(fileUrl)).toBeNull();
        expect(await engine.getDocumentLocalChanges(fileUrl)).toBeNull();
    });

    it('keeps tombstones for synchronized files', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page']), { lastModifiedAt: new Date() });

        // Act
        await engine.deleteFile(fileUrl, { localChanges: fileLocalChanges(fileUrl, 'deleted') });

        // Assert
        const container = await engine.readDocument(containerUrl);

        expect(await engine.getFile(fileUrl)).toMatchObject({ url: fileUrl, deleted: true });
        expect(await engine.getDocumentLocalChanges(fileUrl)).toEqual({
            resources: { [fileUrl]: { state: 'deleted' } },
        });
        await expect(engine.readFile(fileUrl)).rejects.toThrow(DocumentNotFound);
        expect(container.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE)).toHaveLength(0);
    });

    it('evicts file blobs', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page'], { type: 'image/png' }));

        // Act
        await engine.updateFile(fileUrl, { blob: null });

        // Assert
        const container = await engine.readDocument(containerUrl);

        expect(await engine.readFileIfExists(fileUrl)).toBeNull();
        expect(await engine.getFile(fileUrl)).toMatchObject({ url: fileUrl, mimeType: 'image/png' });
        expect(
            container
                .statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value),
        ).toEqual([fileUrl]);
    });

    it('drops files with containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const fileUrl = `${containerUrl}001.png`;

        await engine.writeFile(fileUrl, new Blob(['page']), { localChanges: fileLocalChanges(fileUrl, 'created') });

        // Act
        await engine.dropContainers([containerUrl]);

        // Assert
        expect(await engine.getFile(fileUrl)).toBeNull();
        expect(await engine.getDocumentLocalChanges(fileUrl)).toBeNull();
    });
});
