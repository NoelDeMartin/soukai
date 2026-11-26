import { AsyncLocalStorage } from 'node:async_hooks';

import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import {
    bootModels,
    defineSchema,
    runWithChangeTrackingDisabled,
    setAsyncContextManager,
    setEngine,
    SolidEngine,
} from 'soukai-bis';
import type { SoukaiAsyncContext } from 'soukai-bis';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';

describe('Model malformed attributes', () => {
    it('detects and fixes malformed RDF term types', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            fields: {
                name: z.string(),
                imageUrl: z.url().rdfProperty('image').optional(),
                sameAsUrls: z.array(z.url()).rdfProperty('sameAs').default([]),
                publishedAt: z.date().rdfProperty('datePublished').optional(),
                rating: z.number().optional(),
                featured: z.boolean().optional(),
            },
        });

        bootModels({ Item });

        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Thing ;
                schema:name "Spirited Away" ;
                schema:image "https://example.org/poster.jpg" ;
                schema:sameAs "https://imdb.example/1", <https://tmdb.example/1> ;
                schema:datePublished "2020-01-01T00:00:00.000Z" ;
                schema:rating "5" ;
                schema:featured "true" .
        `;

        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));
        FakeServer.respondOnce(documentUrl, turtle);
        FakeServer.respondOnce(documentUrl, turtle);
        FakeServer.respondOnce(documentUrl);

        const storage = new AsyncLocalStorage<SoukaiAsyncContext>();

        setAsyncContextManager({
            runWithValue: (context, operation) => storage.run(context, operation),
            getValue: () => storage.getStore(),
        });

        // Act
        const item = required(await Item.find(url));
        const malformed = item.getMalformedAttributes();

        expect(item.hasMalformedAttributes()).toBe(true);
        expect(malformed).toEqual(['imageUrl', 'sameAsUrls', 'publishedAt', 'rating', 'featured']);
        expect(item.isDirty()).toBe(false);

        item.fixMalformedAttributes();

        expect(item.hasMalformedAttributes()).toBe(false);
        expect(item.getMalformedAttributes()).toEqual([]);
        expect(item.isDirty()).toBe(true);

        await runWithChangeTrackingDisabled(() => item.save());

        // Assert
        expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/> .

                <#it>
                    schema:image "https://example.org/poster.jpg" ;
                    schema:sameAs "https://imdb.example/1" ;
                    schema:datePublished "2020-01-01T00:00:00.000Z" ;
                    schema:rating "5" ;
                    schema:featured "true" .
            } ;
            INSERT DATA {
                @prefix schema: <https://schema.org/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    schema:image <https://example.org/poster.jpg> ;
                    schema:sameAs <https://imdb.example/1> ;
                    schema:datePublished "2020-01-01T00:00:00.000Z"^^xsd:dateTime ;
                    schema:rating 5 ;
                    schema:featured true .
            }
        `);
    });

    it('does not flag canonical RDF terms as malformed', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            fields: {
                name: z.string(),
                imageUrl: z.url().rdfProperty('image').optional(),
                publishedAt: z.date().rdfProperty('datePublished').optional(),
                rating: z.number().optional(),
                featured: z.boolean().optional(),
            },
        });

        bootModels({ Item });

        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                a schema:Thing ;
                schema:name "Spirited Away"@en ;
                schema:image <https://example.org/poster.jpg> ;
                schema:datePublished "2020-01-01T00:00:00Z"^^xsd:dateTime ;
                schema:rating 5 ;
                schema:featured true .
        `;

        // Act
        const item = required(await Item.fromTurtle(turtle).find(url));

        // Assert
        expect(item.hasMalformedAttributes()).toBe(false);
        expect(item.getMalformedAttributes()).toEqual([]);
    });

    it('clears malformed status when an attribute is updated directly', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            fields: {
                imageUrl: z.url().rdfProperty('image').optional(),
            },
        });

        bootModels({ Item });

        const url = `${fakeDocumentUrl()}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Thing ;
                schema:image "https://example.org/poster.jpg" .
        `;

        // Act
        const item = required(await Item.fromTurtle(turtle).find(url));

        expect(item.hasMalformedAttributes()).toBe(true);

        item.imageUrl = 'https://example.org/new-poster.jpg';

        // Assert
        expect(item.hasMalformedAttributes()).toBe(false);
    });

    it('fixes malformed array attributes on models with history when change tracking is enabled', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            history: true,
            fields: {
                sameAsUrls: z.array(z.url()).rdfProperty('sameAs').default([]),
            },
        });

        bootModels({ Item });

        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Thing ;
                schema:sameAs "https://imdb.example/1", <https://tmdb.example/1> .
        `;

        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));
        FakeServer.respondWith(documentUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(turtle) : FakeResponse.success(),
        );

        // Act
        const item = required(await Item.find(url));

        item.fixMalformedAttributes();

        await item.save();

        // Assert
        const patchBody = FakeServer.getRequest('PATCH', documentUrl)?.body ?? '';

        expect(patchBody).toContain('<https://schema.org/sameAs> "https://imdb.example/1"');
        expect(patchBody).toContain('<https://schema.org/sameAs> <https://imdb.example/1>');
    });

    it('rewrites malformed array literals when directly updated on models with history', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            history: true,
            fields: {
                sameAsUrls: z.array(z.url()).rdfProperty('sameAs').default([]),
            },
        });

        bootModels({ Item });

        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Thing ;
                schema:sameAs "https://imdb.example/1" .
        `;

        setEngine(new SolidEngine({ fetch: FakeServer.fetch }));
        FakeServer.respondWith(documentUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(turtle) : FakeResponse.success(),
        );

        // Act
        const item = required(await Item.find(url));

        item.sameAsUrls = [...item.sameAsUrls, 'https://tmdb.example/2'];

        await item.save();

        // Assert
        const patchBody = FakeServer.getRequest('PATCH', documentUrl)?.body ?? '';

        expect(patchBody).toContain('<https://schema.org/sameAs> "https://imdb.example/1"');
        expect(patchBody).toContain('<https://schema.org/sameAs> <https://imdb.example/1>');
        expect(patchBody).toContain('<https://schema.org/sameAs> <https://tmdb.example/2>');
    });

    it('does not flag fields with custom rdfCast as malformed', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Thing',
            fields: {
                imageUrl: z
                    .url()
                    .rdfProperty('image')
                    .rdfCast({
                        serialize: (value) => value,
                        deserialize: ([value]) => value,
                    })
                    .optional(),
            },
        });

        bootModels({ Item });

        const url = `${fakeDocumentUrl()}#it`;
        const turtle = `
            @prefix schema: <https://schema.org/> .

            <#it>
                a schema:Thing ;
                schema:image "https://example.org/poster.jpg" .
        `;

        // Act
        const item = required(await Item.fromTurtle(turtle).find(url));

        // Assert
        expect(item.hasMalformedAttributes()).toBe(false);
    });
});
