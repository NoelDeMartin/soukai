import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { RDFLiteral, RDFNamedNode } from '@noeldemartin/solid-utils';
import { faker } from '@noeldemartin/faker';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';

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
        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation(new RDFNamedNode(resourceUrl), new RDFNamedNode(property), new RDFLiteral(name)),
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

        const body = FakeServer.fetchSpy.mock.calls[1]?.[1]?.body;

        expect(body).toEqualSparql(`
            DELETE DATA {
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/name> "${oldName}" .
            } ;
            INSERT DATA {
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/name> "${name}" .
            }
        `);
    });

    it('reads many documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl();
        const firstDocumentResource = fakeResourceUrl({ documentUrl: firstDocumentUrl });
        const secondDocumentUrl = fakeDocumentUrl();
        const secondDocumentResource = fakeResourceUrl({ documentUrl: secondDocumentUrl });
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

                <${firstDocumentResource}>
                    rdf:type foaf:Person ;
                    foaf:name "${firstName}" .
            `,
        );

        FakeServer.respond(
            secondDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

                <${secondDocumentResource}>
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
        expect(Object.keys(documents)).toHaveLength(2);
        expect(documents).toHaveProperty(firstDocumentUrl);
        expect(documents).toHaveProperty(secondDocumentUrl);

        await expect(documents[firstDocumentUrl]).toEqualJsonLD({
            '@id': firstDocumentResource,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': firstName,
        });

        await expect(documents[secondDocumentUrl]).toEqualJsonLD({
            '@id': secondDocumentResource,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': secondName,
        });
    });

});
