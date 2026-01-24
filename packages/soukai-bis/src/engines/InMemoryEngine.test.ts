import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';
import { RDFLiteral, RDFNamedNode, expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import { SetPropertyOperation } from 'soukai-bis/models/crdts';
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

        expect(engine.documents[documentUrl]).toEqual(document);
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
        expect(engine.documents[containerUrl]).toEqual({
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
        expect(engine.documents[containerUrl]).toEqual({
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
            new SetPropertyOperation(
                new RDFNamedNode(`${documentUrl}#it`),
                new RDFNamedNode(expandIRI('foaf:name')),
                new RDFLiteral(newName),
            ),
        ]);

        await expect(engine.documents[documentUrl]).toEqualJsonLD({
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
            new SetPropertyOperation(
                new RDFNamedNode(containerUrl),
                LDP_CONTAINS_PREDICATE,
                new RDFNamedNode(documentUrl),
            ),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]).toEqualJsonLD({
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
            new SetPropertyOperation(
                new RDFNamedNode(containerUrl),
                LDP_CONTAINS_PREDICATE,
                new RDFNamedNode(documentUrl),
            ),
            new SetPropertyOperation(
                new RDFNamedNode(containerUrl),
                new RDFNamedNode(expandIRI('rdfs:label')),
                new RDFLiteral(name),
            ),
        ]);

        // Assert
        await expect(engine.documents[containerUrl]).toEqualJsonLD({
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

        engine.documents[documentUrl] = document;

        // Act
        const readDocument = await engine.readDocument(documentUrl);

        // Assert
        await expect(await quadsToJsonLD(readDocument.getQuads())).toEqualJsonLD(document);
    });

    it('reads containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        engine.documents[containerUrl] = { '@id': containerUrl, '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER] };
        engine.documents[documentUrl] = { '@id': documentUrl };

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

});
