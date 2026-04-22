import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import InMemoryEngine from './InMemoryEngine';

describe('InMemoryEngine', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();
    });

    it('creates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        await engine.createDocument(documentUrl, document);

        expect(engine.documents[documentUrl]?.graph).toEqual(document);
    });

    it('creates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(engine.documents[containerUrl]?.graph).toEqual({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
    });

    it('creates containers with meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const name = faker.name.firstName();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(engine.documents[containerUrl]?.graph).toEqual({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });
    });

    it('fails creating documents when they already exist', async () => {
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(documentUrl, {});

        await expect(engine.createDocument(documentUrl, {})).rejects.toBeInstanceOf(DocumentAlreadyExists);
    });

    it('updates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const newName = faker.name.firstName();

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl: `${documentUrl}#it`,
                property: expandIRI('foaf:name'),
                value: [newName],
                date: new Date(),
            }),
        ]);

        await expect(engine.documents[documentUrl]?.graph).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: newName,
        });
    });

    it('updates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
    });

    it('updates containers meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: faker.name.firstName(),
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: expandIRI('rdfs:label'),
                value: [name],
                date: new Date(),
            }),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]?.graph).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });
    });

    it('reads documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        engine.documents[documentUrl] = { graph: document };

        // Act
        const readDocument = await engine.readDocument(documentUrl);

        // Assert
        await expect(await quadsToJsonLD(readDocument.getQuads())).toEqualJsonLD(document);
    });

    it('reads containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        engine.documents[containerUrl] = {
            graph: { '@id': containerUrl, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] },
        };
        engine.documents[documentUrl] = { graph: { '@id': documentUrl } };

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: {
                '@id': documentUrl,
            },
        });
    });

    it('deletes documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        };

        await engine.createDocument(documentUrl, document);

        await engine.deleteDocument(documentUrl);

        expect(engine.documents[documentUrl]).toBeUndefined();
    });

    it('creates documents with metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        // Act
        await engine.createDocument(documentUrl, document, { lastModifiedAt });

        // Assert
        expect(engine.documents[documentUrl]?.lastModifiedAt).toEqual(lastModifiedAt);
    });

    it('reads documents with metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');

        await engine.createDocument(documentUrl, { '@id': documentUrl }, { lastModifiedAt });

        // Act
        const document = await engine.readDocument(documentUrl);

        // Assert
        expect(document.headers.get('Last-Modified')).toEqual(lastModifiedAt.toUTCString());
    });

    it('updates documents with metadata', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const lastModifiedAt = new Date('2023-01-01T00:00:00.000Z');
        const newLastModifiedAt = new Date('2023-02-01T00:00:00.000Z');
        const document: JsonLD = { '@id': documentUrl };

        await engine.createDocument(documentUrl, document, { lastModifiedAt });

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
        expect(engine.documents[documentUrl]?.lastModifiedAt).toEqual(newLastModifiedAt);
    });

    it('gets nested container urls', async () => {
        // Arrange
        const rootContainerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const virtualChildContainerUrl = fakeContainerUrl({ baseUrl: fakeContainerUrl() });

        await engine.createDocument(fakeDocumentUrl({ containerUrl: rootContainerUrl }), {});
        await engine.createDocument(fakeDocumentUrl({ containerUrl: childContainerUrl }), {});
        await engine.createDocument(fakeDocumentUrl({ containerUrl: virtualChildContainerUrl }), {});

        // Act
        const containerUrls = await engine.getContainerUrls();

        // Assert
        expect(containerUrls).toHaveLength(3);
        expect(containerUrls).toEqual(
            expect.arrayContaining([rootContainerUrl, childContainerUrl, virtualChildContainerUrl]),
        );
    });

    it('drops containers', async () => {
        // Arrange
        const containerUrls = [fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl()] as const;
        const documentUrl = fakeDocumentUrl({ containerUrl: containerUrls[0] });

        await engine.createDocument(documentUrl, { '@id': documentUrl });
        await engine.createDocument(containerUrls[1], {
            '@id': containerUrls[1],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[2], {
            '@id': containerUrls[2],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[3], {
            '@id': containerUrls[3],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.dropContainers([containerUrls[0], containerUrls[1]]);

        // Assert
        await expect(engine.readDocument(documentUrl)).rejects.toBeInstanceOf(DocumentNotFound);
    });

});
