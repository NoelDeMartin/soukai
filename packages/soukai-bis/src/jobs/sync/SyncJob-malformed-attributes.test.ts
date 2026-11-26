import { expandIRI, quadsToTurtle } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer, fakeContainerUrl } from '@noeldemartin/testing';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import { containerTurtle } from 'soukai-bis/testing/utils/rdf';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';

import SyncJob from './SyncJob';
import { createLocalDocument, setupSyncTest } from './testing/helpers';
import type { SyncTestContext } from './testing/helpers';

describe('SyncJob malformed attributes', () => {
    let localEngine: InMemoryEngine;
    let typeIndex: TypeIndex;
    let config: SyncTestContext['config'];

    beforeEach(() => {
        ({ localEngine, typeIndex, config } = setupSyncTest());
    });

    it('does not fix malformed attributes by default', async () => {
        // Arrange
        const Bookmark = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Bookmark',
            fields: {
                targetUrl: z.url().rdfProperty('url'),
            },
        });

        bootModels({ Bookmark });

        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = `${containerUrl}item`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Bookmark')],
                instanceContainer: containerUrl,
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondOnce(
            documentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <#it>
                    a schema:Bookmark ;
                    schema:url "https://example.org" .
            `,
        );

        // Act
        await SyncJob.run({
            ...config,
            applicationModels: [{ model: Bookmark, registration: true }],
        });

        // Assert
        expect(FakeServer.getRequest('PATCH', documentUrl)).toBeNull();

        const localDocument = await localEngine.readDocument(documentUrl);

        expect(quadsToTurtle(localDocument.getQuads())).toContain('"https://example.org"');
    });

    it('fixes malformed attributes on pulled documents when enabled globally', async () => {
        // Arrange
        const Bookmark = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Bookmark',
            fields: {
                targetUrl: z.url().rdfProperty('url'),
            },
        });

        bootModels({ Bookmark });

        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = `${containerUrl}item`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Bookmark ;
                schema:url "https://example.org" .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Bookmark')],
                instanceContainer: containerUrl,
            }),
        ];

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondWith(documentUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(turtle) : FakeResponse.success(),
        );

        // Act
        await SyncJob.run({
            ...config,
            fixMalformedAttributes: true,
            applicationModels: [{ model: Bookmark, registration: true }],
        });

        // Assert
        expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/> .

                <#it> schema:url "https://example.org" .
            } ;
            INSERT DATA {
                @prefix schema: <https://schema.org/> .

                <#it> schema:url <https://example.org> .
            }
        `);

        const localDocument = await localEngine.readDocument(documentUrl);

        expect(quadsToTurtle(localDocument.getQuads())).toContain('<https://example.org>');
    });

    it('supports per-model overrides for fixMalformedAttributes', async () => {
        // Arrange
        const Bookmark = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Bookmark',
            fields: {
                targetUrl: z.url().rdfProperty('url'),
            },
        });
        const Note = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'NoteDigitalDocument',
            fields: {
                sourceUrl: z.url().rdfProperty('url'),
            },
        });

        bootModels({ Bookmark, Note });

        const storageUrl = config.userProfile.storageUrls[0];
        const bookmarksContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const notesContainerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const bookmarkDocUrl = `${bookmarksContainerUrl}item`;
        const noteDocUrl = `${notesContainerUrl}item`;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Bookmark')],
                instanceContainer: bookmarksContainerUrl,
            }),
            new TypeRegistration({
                forClass: [expandIRI('schema:NoteDigitalDocument')],
                instanceContainer: notesContainerUrl,
            }),
        ];

        const bookmarkTurtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Bookmark ;
                schema:url "https://bookmark.example" .
        `;

        FakeServer.respondOnce(bookmarksContainerUrl, containerTurtle([bookmarkDocUrl]));
        FakeServer.respondWith(bookmarkDocUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(bookmarkTurtle) : FakeResponse.success(),
        );

        FakeServer.respondOnce(notesContainerUrl, containerTurtle([noteDocUrl]));
        FakeServer.respondOnce(
            noteDocUrl,
            `
                @prefix schema: <https://schema.org/> .

                <#it>
                    a schema:NoteDigitalDocument ;
                    schema:url "https://note.example" .
            `,
        );

        // Act
        await SyncJob.run({
            ...config,
            fixMalformedAttributes: false,
            applicationModels: [
                { model: Bookmark, registration: true, fixMalformedAttributes: true },
                { model: Note, registration: true, fixMalformedAttributes: false },
            ],
        });

        // Assert
        expect(FakeServer.getRequest('PATCH', bookmarkDocUrl)).not.toBeNull();
        expect(FakeServer.getRequest('PATCH', noteDocUrl)).toBeNull();
    });

    it('fixes malformed attributes on already synced documents', async () => {
        // Arrange
        const Bookmark = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Bookmark',
            history: true,
            fields: {
                targetUrl: z.url().rdfProperty('url'),
            },
        });

        bootModels({ Bookmark });

        const storageUrl = config.userProfile.storageUrls[0];
        const containerUrl = fakeContainerUrl({ baseUrl: storageUrl });
        const documentUrl = `${containerUrl}item`;
        const resourceUrl = `${documentUrl}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <${resourceUrl}>
                a schema:Bookmark ;
                schema:url "https://example.org" .
        `;

        typeIndex.relatedRegistrations.related = [
            new TypeRegistration({
                forClass: [expandIRI('schema:Bookmark')],
                instanceContainer: containerUrl,
            }),
        ];

        await createLocalDocument(localEngine, documentUrl, turtle, {
            [resourceUrl]: { updatedAt: new Date('2022-01-01T00:00:00.000Z') },
        });

        FakeServer.respondOnce(containerUrl, containerTurtle([documentUrl]));
        FakeServer.respondWith(documentUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success(turtle, { 'Last-Modified': new Date('2030-01-01T00:00:00.000Z').toUTCString() })
                : FakeResponse.success(),
        );

        // Act
        await SyncJob.run({
            ...config,
            fixMalformedAttributes: true,
            applicationModels: [{ model: Bookmark, registration: true }],
        });

        // Assert
        expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/> .

                <#it> schema:url "https://example.org" .
            } ;
            INSERT DATA {
                @prefix schema: <https://schema.org/> .

                <#it> schema:url <https://example.org> .
            }
        `);

        const localDocument = await localEngine.readDocument(documentUrl);

        expect(quadsToTurtle(localDocument.getQuads())).toContain('<https://example.org>');
    });

    it('does not patch external sources when fixMalformedAttributes is enabled', async () => {
        // Arrange
        const Bookmark = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Bookmark',
            fields: {
                targetUrl: z.url().rdfProperty('url'),
            },
        });

        bootModels({ Bookmark });

        const externalContainerUrl = fakeContainerUrl({ baseUrl: 'https://external.example/' });
        const externalDocUrl = `${externalContainerUrl}item`;

        FakeServer.respondOnce(externalContainerUrl, containerTurtle([externalDocUrl]));
        FakeServer.respondOnce(
            externalDocUrl,
            `
                @prefix schema: <https://schema.org/> .

                <#it>
                    a schema:Bookmark ;
                    schema:url "https://example.org" .
            `,
        );

        // Act
        await SyncJob.run({
            ...config,
            fixMalformedAttributes: true,
            applicationModels: [{ model: Bookmark, registration: false }],
            externalSources: [{ containerUrl: externalContainerUrl, models: [Bookmark] }],
        });

        // Assert
        expect(FakeServer.getRequest('PATCH', externalDocUrl)).toBeNull();

        const localDocument = await localEngine.readDocument(externalDocUrl);

        expect(quadsToTurtle(localDocument.getQuads())).toContain('"https://example.org"');
    });
});
