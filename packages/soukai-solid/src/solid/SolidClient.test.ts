import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';
import { MalformedSolidDocumentError } from '@noeldemartin/solid-utils';
import { faker } from '@noeldemartin/faker';
import { range, stringToSlug, urlResolveDirectory, uuid } from '@noeldemartin/utils';
import type { Tuple } from '@noeldemartin/utils';

import ChangeUrlOperation from 'soukai-solid/solid/operations/ChangeUrlOperation';
import IRI from 'soukai-solid/solid/utils/IRI';
import RDFResourceProperty, { RDFResourcePropertyType } from 'soukai-solid/solid/RDFResourceProperty';
import RemovePropertyOperation from 'soukai-solid/solid/operations/RemovePropertyOperation';
import SolidClient from 'soukai-solid/solid/SolidClient';
import UpdatePropertyOperation from 'soukai-solid/solid/operations/UpdatePropertyOperation';
import { LDP_CONTAINER, RDF_TYPE } from 'soukai-solid/solid/constants';
import type RDFDocument from 'soukai-solid/solid/RDFDocument';

describe('SolidClient', () => {

    let client: SolidClient;

    beforeEach(() => (client = new SolidClient(FakeServer.fetch)));

    it('creates documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const resourceUrl = `${documentUrl}#it`;
        const secondResourceUrl = `${documentUrl}#someone-else`;
        const name = faker.random.word();
        const firstType = fakeDocumentUrl();
        const secondType = fakeDocumentUrl();

        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const { url } = await client.createDocument(containerUrl, documentUrl, [
            RDFResourceProperty.type(documentUrl, IRI('ldp:Document')),
            RDFResourceProperty.literal(resourceUrl, IRI('foaf:name'), name),
            RDFResourceProperty.type(resourceUrl, firstType),
            RDFResourceProperty.type(resourceUrl, secondType),
            RDFResourceProperty.reference(secondResourceUrl, IRI('foaf:knows'), resourceUrl),
        ]);

        // Assert
        expect(url).toEqual(documentUrl);
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/sparql-update',
                'If-None-Match': '*',
            },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[0]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                <> a <http://www.w3.org/ns/ldp#Document> .
                <#it> <http://xmlns.com/foaf/0.1/name> "${name}" .
                <#it> a <${firstType}> .
                <#it> a <${secondType}> .
                <#someone-else> <http://xmlns.com/foaf/0.1/knows> <#it> .
            }
        `);
    });

    it('creates documents without minted url', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        FakeServer.respondOnce('*', FakeResponse.created(undefined, { Location: documentUrl }));

        // Act
        const { url } = await client.createDocument(containerUrl, null, [
            RDFResourceProperty.type(null, IRI('foaf:Person')),
        ]);

        // Assert
        expect(url).toEqual(documentUrl);
        expect(FakeServer.fetch).toHaveBeenCalledWith(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/turtle' },
            body: '<> a <http://xmlns.com/foaf/0.1/Person> .',
        });
    });

    it('creates container documents', async () => {
        // Arrange
        const label = faker.random.word();
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });

        FakeServer.respondOnce(containerUrl, FakeResponse.created(undefined, { Location: containerUrl }));
        FakeServer.respondOnce(containerUrl, FakeResponse.success(`<> a <${LDP_CONTAINER}> .`));
        FakeServer.respondOnce(`${containerUrl}.meta`, FakeResponse.resetContent());

        // Act
        const { url } = await client.createDocument(parentUrl, containerUrl, [
            RDFResourceProperty.literal(containerUrl, IRI('rdfs:label'), label),
            RDFResourceProperty.literal(containerUrl, IRI('purl:modified'), new Date()),
            RDFResourceProperty.type(containerUrl, LDP_CONTAINER),
        ]);

        // Assert
        expect(url).toEqual(containerUrl);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);

        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, {
            method: 'PUT',
            headers: {
                'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                'If-None-Match': '*',
            },
        });

        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, containerUrl, { headers: { Accept: 'text/turtle' } });

        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, `${containerUrl}.meta`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: `INSERT DATA { <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "${label}" . }`,
        });
    });

    it('falls back to creating container documents using POST', async () => {
        // Arrange
        const grandParentSlug = stringToSlug(faker.random.word());
        const parentSlug = stringToSlug(faker.random.word());
        const label = faker.random.word();
        const rootUrl = fakeContainerUrl();
        const metaUrl = fakeDocumentUrl();
        const grandParentUrl = urlResolveDirectory(rootUrl, grandParentSlug);
        const parentUrl = urlResolveDirectory(grandParentUrl, parentSlug);
        const containerUrl = urlResolveDirectory(parentUrl, stringToSlug(label));

        FakeServer.respondOnce('*', FakeResponse.internalServerError()); // PUT new container
        FakeServer.respondOnce('*', FakeResponse.notFound()); // POST new container
        FakeServer.respondOnce('*', FakeResponse.notFound()); // POST parent
        FakeServer.respondOnce('*', FakeResponse.created()); // POST grandparent
        FakeServer.respondOnce('*', FakeResponse.created()); // POST parent
        FakeServer.respondOnce('*', FakeResponse.created()); // POST new container
        FakeServer.respondOnce(
            '*',
            FakeResponse.success(`<> a <${LDP_CONTAINER}> .`, { Link: `<${metaUrl}>; rel="describedby"` }),
        ); // GET container describedBy
        FakeServer.respondOnce('*', FakeResponse.resetContent()); // PATCH container meta

        // Act
        const { url } = await client.createDocument(parentUrl, containerUrl, [
            RDFResourceProperty.literal(containerUrl, IRI('rdfs:label'), label),
            RDFResourceProperty.literal(containerUrl, IRI('purl:modified'), new Date()),
            RDFResourceProperty.type(containerUrl, LDP_CONTAINER),
        ]);

        // Assert
        expect(url).toEqual(containerUrl);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(8);

        [1, 5].forEach((index) => {
            expect(FakeServer.fetchSpy.mock.calls[index]?.[0]).toEqual(parentUrl);
            expect(FakeServer.fetchSpy.mock.calls[index]?.[1]).toEqual({
                method: 'POST',
                headers: {
                    'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                    'Slug': stringToSlug(label),
                    'If-None-Match': '*',
                },
            });
        });

        [2, 4].forEach((index) => {
            expect(FakeServer.fetchSpy.mock.calls[index]?.[0]).toEqual(grandParentUrl);
            expect(FakeServer.fetchSpy.mock.calls[index]?.[1]).toEqual({
                method: 'POST',
                headers: {
                    'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                    'Slug': parentSlug,
                    'If-None-Match': '*',
                },
            });
        });

        expect(FakeServer.fetchSpy.mock.calls[3]?.[0]).toEqual(rootUrl);
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]).toEqual({
            method: 'POST',
            headers: {
                'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                'Slug': grandParentSlug,
                'If-None-Match': '*',
            },
        });

        expect(FakeServer.fetch).toHaveBeenNthCalledWith(7, containerUrl, { headers: { Accept: 'text/turtle' } });

        expect(FakeServer.fetch).toHaveBeenNthCalledWith(8, metaUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: `INSERT DATA { <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "${label}" . }`,
        });
    });

    it('gets one document', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const data = `<${url}> <http://xmlns.com/foaf/0.1/name> "Foo Bar" .`;

        FakeServer.respondOnce(url, FakeResponse.success(data));

        // Act
        const document = (await client.getDocument(url)) as RDFDocument;

        // Assert
        expect(document).not.toBeNull();
        expect(document.requireResource(url).name).toEqual('Foo Bar');

        expect(FakeServer.fetch).toHaveBeenCalledWith(url, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('getting non-existent document returns null', async () => {
        // Arrange
        const url = fakeDocumentUrl();

        FakeServer.respondOnce(url, FakeResponse.notFound());

        // Act
        const document = await client.getDocument(url);

        // Assert
        expect(document).toBeNull();
    });

    it('gets documents using a trailing slash', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        FakeServer.respondOnce(
            containerUrl,
            `
                <>
                    a <http://www.w3.org/ns/ldp#Container> ;
                    <http://www.w3.org/ns/ldp#contains> <foobar>, <another-container/> .

                <foobar> a <https://schema.org/Thing> .
                <another-container/> a <http://www.w3.org/ns/ldp#Container> .
            `,
        );

        FakeServer.respondOnce(
            `${containerUrl}foobar`,
            `
                <>
                    a <http://xmlns.com/foaf/0.1/Person> ;
                    <http://xmlns.com/foaf/0.1/name> "Foo Bar" .
            `,
        );

        FakeServer.respondOnce(`${containerUrl}another-container/`, '<> a <http://www.w3.org/ns/ldp#Container> .');

        // Act
        const documents = (await client.getDocuments(containerUrl)) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        expect(documents[0].url).toEqual(`${containerUrl}foobar`);
        expect(documents[0].requireResource(`${containerUrl}foobar`).url).toEqual(`${containerUrl}foobar`);
        expect(documents[0].requireResource(`${containerUrl}foobar`).name).toEqual('Foo Bar');
        expect(documents[0].requireResource(`${containerUrl}foobar`).types).toEqual([IRI('foaf:Person')]);

        expect(documents[1].url).toEqual(`${containerUrl}another-container/`);
        expect(documents[1].requireResource(`${containerUrl}another-container/`).url).toEqual(
            `${containerUrl}another-container/`,
        );
        expect(documents[1].requireResource(`${containerUrl}another-container/`).types).toEqual([LDP_CONTAINER]);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(3);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, {
            headers: { Accept: 'text/turtle' },
        });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, `${containerUrl}foobar`, {
            headers: { Accept: 'text/turtle' },
        });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, `${containerUrl}another-container/`, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('getting documents with globbing does not mix document properties', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const data = `
            <${containerUrl}/foo>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Foo" .
            <${containerUrl}/bar>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Bar" .
            <${containerUrl}/bar#baz>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Baz" .
        `;

        client.setConfig({ useGlobbing: true });
        FakeServer.respondOnce('*', data);

        // Act
        const documents = (await client.getDocuments(containerUrl)) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        const fooProperties = documents[0].properties;
        expect(Object.values(fooProperties)).toHaveLength(2);
        expect(
            fooProperties.find(
                (property) => property.type === RDFResourcePropertyType.Type && property.value === IRI('foaf:Person'),
            ),
        ).not.toBeUndefined();
        expect(
            fooProperties.find(
                (property) =>
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Foo',
            ),
        ).not.toBeUndefined();

        expect(documents[1].resources).toHaveLength(2);
        expect(documents[1].requireResource(`${containerUrl}/bar`).url).toEqual(`${containerUrl}/bar`);
        expect(documents[1].resources[1]?.url).toEqual(`${containerUrl}/bar#baz`);

        const barProperties = documents[1].properties;
        expect(Object.values(barProperties)).toHaveLength(4);
        expect(
            barProperties.find(
                (property) => property.type === RDFResourcePropertyType.Type && property.value === IRI('foaf:Person'),
            ),
        ).not.toBeUndefined();
        expect(
            barProperties.find(
                (property) =>
                    property.resourceUrl === `${containerUrl}/bar` &&
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Bar',
            ),
        ).not.toBeUndefined();
        expect(
            barProperties.find(
                (property) =>
                    property.resourceUrl === `${containerUrl}/bar#baz` &&
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Baz',
            ),
        ).not.toBeUndefined();
    });

    it('getting container documents does not use globbing', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const type = fakeDocumentUrl();

        client.setConfig({ useGlobbing: true });
        FakeServer.respondOnce(
            containerUrl,
            FakeResponse.success(`
                <> <http://www.w3.org/ns/ldp#contains> <foo>, <bar> .
                <foo> a <http://www.w3.org/ns/ldp#Container> .
                <bar> a <http://www.w3.org/ns/ldp#Container> .
            `),
        );
        FakeServer.respondOnce(
            `${containerUrl}foo`,
            FakeResponse.success(`
                <${containerUrl}foo>
                    a <http://www.w3.org/ns/ldp#Container>, <${type}> ;
                    <http://xmlns.com/foaf/0.1/name> "Foo" .
            `),
        );
        FakeServer.respondOnce(
            `${containerUrl}bar`,
            FakeResponse.success(`
                <${containerUrl}bar>
                    a <http://www.w3.org/ns/ldp#Container> ;
                    <http://xmlns.com/foaf/0.1/name> "Bar" .
            `),
        );

        // Act
        const documents = (await client.getDocuments(containerUrl, true)) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        expect(documents[0].url).toEqual(`${containerUrl}foo`);
        expect(documents[0].requireResource(`${containerUrl}foo`).url).toEqual(`${containerUrl}foo`);
        expect(documents[0].requireResource(`${containerUrl}foo`).name).toEqual('Foo');
        expect(documents[0].requireResource(`${containerUrl}foo`).types).toEqual([LDP_CONTAINER, type]);

        expect(documents[1].url).toEqual(`${containerUrl}bar`);
        expect(documents[1].requireResource(`${containerUrl}bar`).url).toEqual(`${containerUrl}bar`);
        expect(documents[1].requireResource(`${containerUrl}bar`).name).toEqual('Bar');
        expect(documents[1].requireResource(`${containerUrl}bar`).types).toEqual([LDP_CONTAINER]);

        expect(FakeServer.fetch).toHaveBeenCalledWith(containerUrl, {
            headers: { Accept: 'text/turtle' },
        });
        expect(FakeServer.fetch).toHaveBeenCalledWith(`${containerUrl}foo`, {
            headers: { Accept: 'text/turtle' },
        });
        expect(FakeServer.fetch).toHaveBeenCalledWith(`${containerUrl}bar`, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('updates documents', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const data = `
            <${url}>
                <http://xmlns.com/foaf/0.1/name> "Johnathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
        `;
        const operations = [
            new UpdatePropertyOperation(RDFResourceProperty.literal(url, 'http://xmlns.com/foaf/0.1/name', 'John Doe')),
            new RemovePropertyOperation(url, 'http://xmlns.com/foaf/0.1/surname'),
            new RemovePropertyOperation(url, 'http://xmlns.com/foaf/0.1/givenName'),
        ];

        FakeServer.respondOnce(documentUrl, FakeResponse.success(data));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, operations);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "Johnathan" .
                <#it> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <#it> <http://xmlns.com/foaf/0.1/givenName> "John" .
            } ;
            INSERT DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "John Doe" .
            }
        `);
    });

    it('updates documents using the same notation for deleted triples', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const data = `
            @prefix purl: <http://purl.org/dc/terms/> .
            @prefix xml: <http://www.w3.org/2001/XMLSchema#> .

            <#it>
                purl:created "2018-11-14T00:00:00Z"^^xml:dateTime ;
                purl:modified "2018-11-14T00:00:00.000Z"^^xml:dateTime .
        `;
        const operations = [
            new RemovePropertyOperation(url, 'http://purl.org/dc/terms/created'),
            new RemovePropertyOperation(url, 'http://purl.org/dc/terms/modified'),
        ];

        FakeServer.respondOnce(documentUrl, FakeResponse.success(data));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, operations);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toContain(
            '"2018-11-14T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .',
        );
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toContain(
            '"2018-11-14T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .',
        );
    });

    it('updates container documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const metaDocumentName = '.' + stringToSlug(faker.random.word());
        const metaDocumentUrl = containerUrl + metaDocumentName;
        const data = `
            <${containerUrl}>
                a <http://www.w3.org/ns/ldp#Container> ;
                <http://xmlns.com/foaf/0.1/name> "Jonathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
        `;
        const operations = [
            new UpdatePropertyOperation(
                RDFResourceProperty.literal(containerUrl, 'http://xmlns.com/foaf/0.1/name', 'John Doe'),
            ),
            new RemovePropertyOperation(containerUrl, 'http://xmlns.com/foaf/0.1/surname'),
            new RemovePropertyOperation(containerUrl, 'http://xmlns.com/foaf/0.1/givenName'),
        ];

        FakeServer.respondOnce(
            containerUrl,
            FakeResponse.success(data, { Link: `<${metaDocumentName}>; rel="describedBy"` }),
        );
        FakeServer.respondOnce(metaDocumentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(containerUrl, operations);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(metaDocumentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${containerUrl}> <http://xmlns.com/foaf/0.1/name> "Jonathan" .
                <${containerUrl}> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <${containerUrl}> <http://xmlns.com/foaf/0.1/givenName> "John" .
            } ;
            INSERT DATA {
                <${containerUrl}> <http://xmlns.com/foaf/0.1/name> "John Doe" .
            }
        `);
    });

    it('reuses meta document on subsequent container updates', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const metaDocumentName = '.' + stringToSlug(faker.random.word());
        const descriptionDocumentUrl = containerUrl + metaDocumentName;

        FakeServer.respondOnce(
            containerUrl,
            FakeResponse.success(
                `
                    <${containerUrl}>
                        a <http://www.w3.org/ns/ldp#Container> ;
                        <http://www.w3.org/2000/01/rdf-schema#label> "Things" .
                `,
                { Link: `<${metaDocumentName}>; rel="describedBy"` },
            ),
        );
        FakeServer.respondOnce(descriptionDocumentUrl, FakeResponse.success());
        FakeServer.respondOnce(
            descriptionDocumentUrl,
            FakeResponse.success(`
                <${containerUrl}>
                    a <http://www.w3.org/ns/ldp#Container> ;
                    <http://www.w3.org/2000/01/rdf-schema#label> "Updated Things" .
            `),
        );
        FakeServer.respondOnce(descriptionDocumentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(containerUrl, [
            new UpdatePropertyOperation(
                RDFResourceProperty.literal(
                    containerUrl,
                    'http://www.w3.org/2000/01/rdf-schema#label',
                    'Updated Things',
                ),
            ),
        ]);

        await client.updateDocument(containerUrl, [
            new UpdatePropertyOperation(
                RDFResourceProperty.literal(
                    containerUrl,
                    'http://www.w3.org/2000/01/rdf-schema#label',
                    'Updated Things again',
                ),
            ),
        ]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, { headers: { Accept: 'text/turtle' } });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, descriptionDocumentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, descriptionDocumentUrl, {
            headers: { Accept: 'text/turtle' },
        });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, descriptionDocumentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "Things" .
            } ;
            INSERT DATA {
                <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "Updated Things" .
            }
        `);

        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "Updated Things" .
            } ;
            INSERT DATA {
                <${containerUrl}> <http://www.w3.org/2000/01/rdf-schema#label> "Updated Things again" .
            }
        `);
    });

    it('changes resource urls', async () => {
        // Arrange
        const legacyParentUrl = fakeContainerUrl();
        const legacyDocumentUrl = fakeDocumentUrl({ containerUrl: legacyParentUrl });
        const parentUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl: parentUrl });
        const firstResourceUrl = legacyDocumentUrl;
        const secondResourceUrl = `${legacyDocumentUrl}#someone-else`;
        const newFirstResourceUrl = `${documentUrl}#it`;
        const newSecondResourceUrl = `${documentUrl}#someone-else`;
        const data = `
            <${firstResourceUrl}>
                <http://xmlns.com/foaf/0.1/name> "Johnathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
            <${secondResourceUrl}>
                <http://xmlns.com/foaf/0.1/name> "Amy" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/knows> <${firstResourceUrl}> .
        `;
        const knowsProperty = RDFResourceProperty.reference(
            secondResourceUrl,
            'http://xmlns.com/foaf/0.1/knows',
            newFirstResourceUrl,
        );
        const operations = [
            new ChangeUrlOperation(firstResourceUrl, newFirstResourceUrl),
            new ChangeUrlOperation(secondResourceUrl, newSecondResourceUrl),
            new UpdatePropertyOperation(knowsProperty),
        ];

        FakeServer.respondOnce(documentUrl, FakeResponse.success(data));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, operations);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${firstResourceUrl}> <http://xmlns.com/foaf/0.1/name> "Johnathan" .
                <${firstResourceUrl}> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <${firstResourceUrl}> <http://xmlns.com/foaf/0.1/givenName> "John" .
                <${secondResourceUrl}> <http://xmlns.com/foaf/0.1/name> "Amy" .
                <${secondResourceUrl}> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <${secondResourceUrl}> <http://xmlns.com/foaf/0.1/knows> <${firstResourceUrl}> .
            } ;
            INSERT DATA {
                <#someone-else> <http://xmlns.com/foaf/0.1/knows> <#it> .
                <#it> <http://xmlns.com/foaf/0.1/name> "Johnathan" .
                <#it> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <#it> <http://xmlns.com/foaf/0.1/givenName> "John" .
                <#someone-else> <http://xmlns.com/foaf/0.1/name> "Amy" .
                <#someone-else> <http://xmlns.com/foaf/0.1/surname> "Doe" .
            }
        `);
    });

    it('adds new properties when updating', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const data = `<${url}> a <http://xmlns.com/foaf/0.1/Person> .`;
        const operations = [
            new UpdatePropertyOperation(RDFResourceProperty.literal(url, 'http://xmlns.com/foaf/0.1/name', 'John Doe')),
        ];

        FakeServer.respondOnce(url, FakeResponse.success(data));
        FakeServer.respondOnce(url, FakeResponse.success());

        // Act
        await client.updateDocument(url, operations);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                <> <http://xmlns.com/foaf/0.1/name> "John Doe" .
            }
        `);
    });

    it('deletes all properties from a resource within a document', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;
        const data = `
            <${documentUrl}>
                a <http://www.w3.org/ns/ldp#Resource> .
            <${url}>
                <http://xmlns.com/foaf/0.1/name> "Johnathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
        `;

        FakeServer.respondOnce(documentUrl, FakeResponse.success(data));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, [new RemovePropertyOperation(url)]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "Johnathan" .
                <#it> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <#it> <http://xmlns.com/foaf/0.1/givenName> "John" .
            }
        `);
    });

    it('deletes all properties from a resource within a container document', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const metaDocumentUrl = `${containerUrl}.meta`;
        const resourceUrl = `${containerUrl}#it`;
        const metadataUrl = `${resourceUrl}-metadata`;
        const data = `
            <>
                a <http://www.w3.org/ns/ldp#Container>, <https://schema.org/Collection> ;
                <http://www.w3.org/2000/01/rdf-schema#label> "Container name" ;
                <http://purl.org/dc/terms/modified>
                    "2020-03-08T14:33:09.123Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            <${resourceUrl}>
                <http://xmlns.com/foaf/0.1/name> "Jonathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
            <${metadataUrl}>
                <https://vocab.noeldemartin.com/crdt/createdAt>
                    "2020-03-08T14:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `;

        FakeServer.respondOnce(containerUrl, data);
        FakeServer.respondOnce(metaDocumentUrl);

        // Act
        await client.updateDocument(containerUrl, [
            new RemovePropertyOperation(resourceUrl),
            new RemovePropertyOperation(metadataUrl),
        ]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(metaDocumentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/name> "Jonathan" .
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <${resourceUrl}> <http://xmlns.com/foaf/0.1/givenName> "John" .
                <${metadataUrl}>
                    <https://vocab.noeldemartin.com/crdt/createdAt>
                        "2020-03-08T14:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            }
        `);
    });

    it('fails updating non-existent documents', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const data = `<${url}> a <http://xmlns.com/foaf/0.1/Person> .`;

        FakeServer.respondOnce(url, FakeResponse.success(data));
        FakeServer.respondOnce(url, FakeResponse.notFound());

        // Act & Assert
        await expect(client.updateDocument(url, [new RemovePropertyOperation(url, RDF_TYPE)])).rejects.toThrowError(
            `Error updating document at ${url} (returned 404 status code)`,
        );
    });

    it('ignores empty updates', async () => {
        await client.updateDocument(fakeDocumentUrl(), []);

        expect(FakeServer.fetch).not.toHaveBeenCalled();
    });

    it('ignores idempotent operations', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const now = new Date();
        const data = `
            <>
                <http://www.w3.org/2000/01/rdf-schema#label> "Things" ;
                <http://purl.org/dc/terms/modified>
                    "${now.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `;

        FakeServer.respondOnce(documentUrl, FakeResponse.success(data));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, [
            new UpdatePropertyOperation(RDFResourceProperty.literal(documentUrl, IRI('rdfs:label'), 'Things')),
            new UpdatePropertyOperation(RDFResourceProperty.literal(documentUrl, IRI('purl:modified'), now)),
            new UpdatePropertyOperation(RDFResourceProperty.literal(documentUrl, IRI('foaf:name'), 'Things')),
        ]);

        // Assert
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA { <> <http://xmlns.com/foaf/0.1/name> "Things" . }
        `);
    });

    it('updates array properties', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const personUrl = fakeResourceUrl({ documentUrl });
        const memberUrls = range(3).map(() => fakeResourceUrl({ hash: uuid() }));
        const friendUrls = range(2).map(() => fakeResourceUrl({ hash: uuid() }));

        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.updateDocument(documentUrl, [
            new UpdatePropertyOperation(
                memberUrls.map((url) => RDFResourceProperty.reference(personUrl, IRI('foaf:member'), url)),
            ),
            new UpdatePropertyOperation(
                friendUrls.map((url) => RDFResourceProperty.reference(personUrl, IRI('foaf:knows'), url)),
            ),
        ]);

        // Assert
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                ${memberUrls.map((url) => `<#it> foaf:member <${url}> .`).join('\n')}
                ${friendUrls.map((url) => `<#it> foaf:knows <${url}> .`).join('\n')}
            }
        `);
    });

    it('deletes non-container documents', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const data = `
            <${url}>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Foo Bar" .
        `;

        FakeServer.respondOnce(url, FakeResponse.success(data));
        FakeServer.respondOnce(url, FakeResponse.success());

        // Act
        await client.deleteDocument(url);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledWith(url, { method: 'DELETE' });
    });

    it('deletes container documents', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const containerData = `
            <${containerUrl}>
                a <http://www.w3.org/ns/ldp#Container> ;
                <http://www.w3.org/ns/ldp#contains> <${documentUrl}> .
        `;
        const documentData = `
            <${documentUrl}>
                a <http://xmlns.com/foaf/0.1/Person> .
        `;

        FakeServer.respondOnce(containerUrl, FakeResponse.success(containerData));
        FakeServer.respondOnce(documentUrl, FakeResponse.success(documentData));
        FakeServer.respondOnce(containerUrl, FakeResponse.success());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        await client.deleteDocument(containerUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(1, containerUrl, { headers: { Accept: 'text/turtle' } });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(2, documentUrl, { headers: { Accept: 'text/turtle' } });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(3, documentUrl, { method: 'DELETE' });
        expect(FakeServer.fetch).toHaveBeenNthCalledWith(4, containerUrl, { method: 'DELETE' });
    });

    it('checks if a document exists', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const data = `<${url}> a <http://xmlns.com/foaf/0.1/Person> .`;

        FakeServer.respondOnce(url, FakeResponse.success(data));

        // Act
        const exists = await client.documentExists(url);

        // Assert
        expect(exists).toBe(true);
    });

    it('checks if a document does not exist', async () => {
        // Arrange
        const url = fakeDocumentUrl();

        FakeServer.respondOnce(url, FakeResponse.notFound());

        // Act
        const exists = await client.documentExists(url);

        // Assert
        expect(exists).toBe(false);
    });

    it('handles malformed document errors', async () => {
        // Arrange
        let error!: MalformedSolidDocumentError;
        const url = fakeDocumentUrl();

        FakeServer.respondOnce(url, FakeResponse.success('this is not turtle'));

        // Act
        try {
            await client.getDocument(url);
        } catch (e) {
            error = e as MalformedSolidDocumentError;
        }

        // Assert
        expect(error).toBeInstanceOf(MalformedSolidDocumentError);
        expect(error.message).toEqual(`Malformed Turtle document found at ${url} - Unexpected "this" on line 1.`);
    });

    it('handles malformed document errors reading containers', async () => {
        // Arrange
        let error!: MalformedSolidDocumentError;
        const containerUrl = fakeContainerUrl();

        FakeServer.respondOnce(containerUrl, FakeResponse.success('this is not turtle'));

        // Act
        try {
            await client.getDocuments(containerUrl);
        } catch (e) {
            error = e as MalformedSolidDocumentError;
        }

        // Assert
        expect(error).toBeInstanceOf(MalformedSolidDocumentError);
        expect(error.message).toEqual(
            `Malformed Turtle document found at ${containerUrl} - Unexpected "this" on line 1.`,
        );
    });

});
