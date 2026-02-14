import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { faker } from '@noeldemartin/faker';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

import SolidEngine from './SolidEngine';

describe('SolidEngine', () => {

    let engine: SolidEngine;

    beforeEach(() => {
        engine = new SolidEngine(FakeServer.fetch);
    });

    it('creates documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.created());

        // Act
        await engine.createDocument(documentUrl, {
            '@id': documentUrl,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            1,
            documentUrl,
            expect.objectContaining({
                headers: {
                    Accept: 'text/turtle',
                },
            }),
        );
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.objectContaining({ method: 'PATCH' }));

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <>
                    a foaf:Person ;
                    foaf:name "${name}" .
            }
        `);
    });

    it('creates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        FakeServer.respondOnce(containerUrl, FakeResponse.notFound());
        FakeServer.respondOnce(containerUrl, FakeResponse.created());

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': LDP_CONTAINER,
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            1,
            containerUrl,
            expect.objectContaining({
                headers: {
                    Accept: 'text/turtle',
                },
            }),
        );
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            2,
            containerUrl,
            expect.objectContaining({
                method: 'PUT',
                headers: expect.objectContaining({
                    'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                    'If-None-Match': '*',
                }),
            }),
        );
    });

    it('creates containers with meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        FakeServer.respondOnce(containerUrl, FakeResponse.notFound());
        FakeServer.respondOnce(containerUrl, FakeResponse.created());
        FakeServer.respondOnce(`${containerUrl}.meta`, FakeResponse.success());

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': LDP_CONTAINER,
            [expandIRI('rdfs:label')]: 'My Container',
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            2,
            containerUrl,
            expect.objectContaining({
                method: 'PUT',
            }),
        );
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            3,
            `${containerUrl}.meta`,
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('My Container'),
            }),
        );

        await expect(FakeServer.fetchSpy.mock.calls[2]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                <> <http://www.w3.org/2000/01/rdf-schema#label> "My Container" .
            }
        `);
    });

    it('fails creating documents when they already exist', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const createDocument = () =>
            engine.createDocument(documentUrl, {
                '@id': documentUrl,
                '@type': expandIRI('foaf:Person'),
                [expandIRI('foaf:name')]: name,
            });

        // Assert
        await expect(createDocument).rejects.toBeInstanceOf(DocumentAlreadyExists);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            1,
            documentUrl,
            expect.objectContaining({
                headers: {
                    Accept: 'text/turtle',
                },
            }),
        );
    });

    it('updates documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const resourceUrl = `${documentUrl}#it`;
        const oldName = faker.name.firstName();
        const name = faker.name.firstName();
        const property = expandIRI('foaf:name');

        FakeServer.respondOnce(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${resourceUrl}>
                    a foaf:Person ;
                    foaf:name "${oldName}" .
            `,
        );
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation({
                resourceUrl,
                property,
                value: [name],
                date: new Date(),
            }),
        ]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            2,
            documentUrl,
            expect.objectContaining({
                method: 'PATCH',
                headers: expect.objectContaining({
                    'Content-Type': 'application/sparql-update',
                }),
            }),
        );

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "${oldName}" .
            } ;
            INSERT DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "${name}" .
            }
        `);
    });

    it('updates containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [fakeDocumentUrl()],
                date: new Date(),
            }).setNamedNode(true),
        ]);

        // Assert
        expect(FakeServer.fetch).not.toHaveBeenCalled();
    });

    it('updates containers meta', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const oldName = faker.name.firstName();
        const name = faker.name.firstName();
        const property = expandIRI('rdfs:label');

        FakeServer.respondOnce(
            containerUrl,
            FakeResponse.success(
                `
                    @prefix ldp: <http://www.w3.org/ns/ldp#> .
                    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

                    <${containerUrl}>
                        a ldp:Container, ldp:BasicContainer ;
                        rdfs:label "${oldName}" .
                `,
                { Link: `<${containerUrl}.custom-meta>; rel="describedBy"` },
            ),
        );
        FakeServer.respondOnce(`${containerUrl}.custom-meta`, FakeResponse.success());

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [fakeDocumentUrl()],
                date: new Date(),
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property,
                value: [name],
                date: new Date(),
            }),
        ]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(
            2,
            `${containerUrl}.custom-meta`,
            expect.objectContaining({
                method: 'PATCH',
                headers: expect.objectContaining({
                    'Content-Type': 'application/sparql-update',
                }),
            }),
        );

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <> <http://www.w3.org/2000/01/rdf-schema#label> "${oldName}" .
            } ;
            INSERT DATA {
                <> <http://www.w3.org/2000/01/rdf-schema#label> "${name}" .
            }
        `);
    });

    it('reads documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        FakeServer.respond(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${documentUrl}>
                    a foaf:Person ;
                    foaf:name "${name}" .
            `,
        );

        // Act
        const document = await engine.readDocument(documentUrl);

        // Assert
        await expect(await quadsToJsonLD(document.getQuads())).toEqualJsonLD({
            '@id': documentUrl,
            '@type': expandIRI('foaf:Person'),
            [expandIRI('foaf:name')]: name,
        });
    });

    it('deletes documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await engine.deleteDocument(documentUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, documentUrl, expect.objectContaining({ method: 'DELETE' }));
    });

    it('throws error when using metadata', async () => {
        const documentUrl = fakeDocumentUrl();
        const document: JsonLD = { '@id': documentUrl };
        const metadata = { lastModifiedAt: new Date() };

        await expect(engine.createDocument(documentUrl, document, metadata)).rejects.toBeInstanceOf(SoukaiError);
        await expect(engine.updateDocument(documentUrl, [], metadata)).rejects.toBeInstanceOf(SoukaiError);
    });

});
