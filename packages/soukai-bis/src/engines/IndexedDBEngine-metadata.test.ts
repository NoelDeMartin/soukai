import { expandIRI } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';
import { getDatabaseDocuments, setDatabaseDocument } from './testing/helpers';

describe('IndexedDBEngine metadata', () => {
    let engine: IndexedDBEngine;

    beforeEach(() => {
        engine = new IndexedDBEngine();
    });

    it('creates documents with metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        // Act
        await engine.createDocument(documentUrl, document, { lastModifiedAt });

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: documentUrl,
            containerUrl,
            resources: {},
            lastModifiedAt,
            status: 'empty',
        });
    });

    it('updates documents with metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const newLastModifiedAt = new Date('2023-02-01T00:00:00.000Z');

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl }, { lastModifiedAt });

        // Act
        await engine.updateDocument(
            documentUrl,
            [
                new SetPropertyOperation({
                    resourceUrl: documentUrl,
                    property: expandIRI('rdfs:label'),
                    value: ['Updated'],
                    date: new Date(),
                }),
            ],
            { lastModifiedAt: newLastModifiedAt },
        );

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]?.lastModifiedAt).toEqual(newLastModifiedAt);
    });

    it('keeps last modified at when updating documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl }, { lastModifiedAt });

        // Act
        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl: documentUrl,
                property: expandIRI('rdfs:label'),
                value: ['Updated'],
                date: new Date(),
            }),
        ]);

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]?.lastModifiedAt).toEqual(lastModifiedAt);
    });

    it('purges metadata', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date();

        await setDatabaseDocument(
            containerUrl,
            documentUrl,
            {
                '@id': documentUrl,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );

        const initialDocuments = await getDatabaseDocuments(containerUrl);
        expect(initialDocuments[0]?.lastModifiedAt).toEqual(lastModifiedAt);

        // Act
        await engine.purgeMetadata();

        // Assert
        const purgedDocuments = await getDatabaseDocuments(containerUrl);
        expect(purgedDocuments[0]?.lastModifiedAt).toBeUndefined();
    });

    it('purges metadata for specific documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl1 = fakeDocumentUrl({ containerUrl });
        const documentUrl2 = fakeDocumentUrl({ containerUrl });
        const lastModifiedAt = new Date();

        await setDatabaseDocument(
            containerUrl,
            documentUrl1,
            {
                '@id': documentUrl1,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );

        await setDatabaseDocument(
            containerUrl,
            documentUrl2,
            {
                '@id': documentUrl2,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );

        // Act
        await engine.purgeMetadata({ documentUrls: [documentUrl1] });

        // Assert
        const documents = await getDatabaseDocuments(containerUrl);
        const doc1 = documents.find((doc) => doc.url === documentUrl1);
        const doc2 = documents.find((doc) => doc.url === documentUrl2);

        expect(doc1?.lastModifiedAt).toBeUndefined();
        expect(doc2?.lastModifiedAt).toEqual(lastModifiedAt);
    });

    it('gets documents last modified at', async () => {
        // Arrange
        const firstUrl = fakeDocumentUrl();
        const secondUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date();

        await engine.createDocument(
            firstUrl,
            {
                '@id': firstUrl,
                '@type': 'http://schema.org/CreativeWork',
            },
            { lastModifiedAt },
        );
        await engine.createDocument(secondUrl, {
            '@id': secondUrl,
            '@type': 'http://schema.org/CreativeWork',
        });

        // Act
        const timestamps = await engine.getDocumentsLastModifiedAt();

        // Assert
        expect(timestamps[firstUrl]).toBeInstanceOf(Date);
        expect(timestamps[firstUrl]?.getTime()).toBe(lastModifiedAt.getTime());
        expect(timestamps[secondUrl]).toBeNull();
    });
});
