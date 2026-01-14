import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';

import SolidEngine from './SolidEngine';

describe('SolidEngine', () => {

    let engine: SolidEngine;

    beforeEach(() => {
        FakeServer.reset();

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
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
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
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, expect.objectContaining({ method: 'PUT' }));

        const body = FakeServer.fetchSpy.mock.calls[1]?.[1]?.body;
        expect(body).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

            <${documentUrl}>
                rdf:type foaf:Person ;
                foaf:name "${name}" .
        `);
    });

    it('fails when document already exists', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const createDocument = () =>
            engine.createDocument(documentUrl, {
                '@id': documentUrl,
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                'http://xmlns.com/foaf/0.1/name': name,
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
        const name = faker.name.firstName();

        FakeServer.respond(documentUrl, FakeResponse.success());

        // Act
        await engine.updateDocument(documentUrl, {
            '@id': documentUrl,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(
            documentUrl,
            expect.objectContaining({
                method: 'PUT',
            }),
        );

        const body = FakeServer.fetchSpy.mock.calls[0]?.[1]?.body;

        expect(body).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

            <${documentUrl}>
                rdf:type foaf:Person ;
                foaf:name "${name}" .
        `);
    });

    it('reads many documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl();
        const secondDocumentUrl = fakeDocumentUrl();
        const containerDocumentUrl = fakeContainerUrl();
        const firstName = faker.name.firstName();
        const secondName = faker.name.firstName();

        FakeServer.respond(
            containerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .

                <${containerUrl}>
                    ldp:contains <${firstDocumentUrl}>, <${secondDocumentUrl}>, <${containerDocumentUrl}> .
            `,
        );

        FakeServer.respond(
            firstDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

                <${firstDocumentUrl}>
                    rdf:type foaf:Person ;
                    foaf:name "${firstName}" .
            `,
        );

        FakeServer.respond(
            secondDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

                <${secondDocumentUrl}>
                    rdf:type foaf:Person ;
                    foaf:name "${secondName}" .
            `,
        );

        FakeServer.respond(
            containerDocumentUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

                <${containerDocumentUrl}>
                    rdf:type ldp:Container .
            `,
        );

        // Act
        const documents = await engine.readManyDocuments(containerUrl);

        // Assert
        expect(documents).toHaveProperty(firstDocumentUrl);
        expect(documents).toHaveProperty(secondDocumentUrl);
        expect(documents).not.toHaveProperty(containerDocumentUrl);

        const firstDocument = documents[firstDocumentUrl];
        const firstDocumentGraph = firstDocument as JsonLDGraph;
        const firstDocumentNode = firstDocumentGraph['@graph'].find((node) => node['@id'] === firstDocumentUrl);

        expect(firstDocumentNode).toEqual(
            expect.objectContaining({
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                'http://xmlns.com/foaf/0.1/name': firstName,
            }),
        );

        const secondDocument = documents[secondDocumentUrl];
        const secondDocumentGraph = secondDocument as JsonLDGraph;
        const secondDocumentNode = secondDocumentGraph['@graph'].find((node) => node['@id'] === secondDocumentUrl);

        expect(secondDocumentNode).toEqual(
            expect.objectContaining({
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                'http://xmlns.com/foaf/0.1/name': secondName,
            }),
        );
    });

    it('updates documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const resourceUrl = `${documentUrl}#it`;
        const oldName = faker.name.firstName();
        const name = faker.name.firstName();
        const property = 'http://xmlns.com/foaf/0.1/name';

        FakeServer.respondOnce(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

                <${resourceUrl}>
                    rdf:type foaf:Person ;
                    foaf:name "${oldName}" .
            `,
        );
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await engine.updateDocument(
            documentUrl,
            {
                '@id': resourceUrl,
                '@type': 'http://xmlns.com/foaf/0.1/Person',
                [property]: name,
            },
            [property],
        );

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(
            documentUrl,
            expect.objectContaining({
                method: 'PATCH',
                headers: expect.objectContaining({
                    'Content-Type': 'application/sparql-update',
                }),
            }),
        );

        const body = FakeServer.fetchSpy.mock.calls[1]?.[1]?.body as string;

        expect(body).toEqualSparql(`
            DELETE DATA {
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/name> "${oldName}" .
            } ;
            INSERT DATA {
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/name> "${name}" .
            }
        `);
    });

});
