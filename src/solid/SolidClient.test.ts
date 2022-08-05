import Faker from 'faker';
import { range, stringToSlug, urlResolve, urlResolveDirectory, urlRoute, uuid } from '@noeldemartin/utils';
import type { Tuple } from '@noeldemartin/utils';

import MalformedDocumentError from '@/errors/MalformedDocumentError';

import ChangeUrlOperation from '@/solid/operations/ChangeUrlOperation';
import IRI from '@/solid/utils/IRI';
import RDFResourceProperty, { RDFResourcePropertyType } from '@/solid/RDFResourceProperty';
import RemovePropertyOperation from '@/solid/operations/RemovePropertyOperation';
import SolidClient from '@/solid/SolidClient';
import UpdatePropertyOperation from '@/solid/operations/UpdatePropertyOperation';
import type RDFDocument from '@/solid/RDFDocument';

import StubFetcher from '@/testing/lib/stubs/StubFetcher';
import { fakeResourceUrl } from '@/testing/utils';

describe('SolidClient', () => {

    let client: SolidClient;

    beforeEach(() => {
        StubFetcher.reset();

        client = new SolidClient(StubFetcher.fetch.bind(StubFetcher));
    });

    it('creates documents', async () => {
        // Arrange
        const parentUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const documentUrl = urlResolve(parentUrl, Faker.random.uuid());
        const resourceUrl = `${documentUrl}#it`;
        const secondResourceUrl = `${documentUrl}#someone-else`;
        const name = Faker.random.word();
        const firstType = urlResolve(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const secondType = urlResolve(Faker.internet.url(), stringToSlug(Faker.random.word()));

        StubFetcher.addFetchResponse();

        // Act
        const url = await client.createDocument(
            parentUrl,
            documentUrl,
            [
                RDFResourceProperty.type(documentUrl, IRI('ldp:Document')),
                RDFResourceProperty.literal(resourceUrl, IRI('foaf:name'), name),
                RDFResourceProperty.type(resourceUrl, firstType),
                RDFResourceProperty.type(resourceUrl, secondType),
                RDFResourceProperty.reference(secondResourceUrl, IRI('foaf:knows'), resourceUrl),
            ],
        );

        // Assert
        expect(url).toEqual(documentUrl);
        expect(StubFetcher.fetch).toHaveBeenCalledWith(documentUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/sparql-update',
                'If-None-Match': '*',
            },
            body: expect.anything(),
        });

        expect(StubFetcher.fetchSpy.mock.calls[0]?.[1]?.body).toEqualSparql(`
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
        const parentUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const documentUrl = urlResolve(parentUrl, Faker.random.uuid());

        StubFetcher.addFetchResponse('', { Location: documentUrl }, 201);

        // Act
        const url = await client.createDocument(
            parentUrl,
            null,
            [
                RDFResourceProperty.type(null, IRI('foaf:Person')),
            ],
        );

        // Assert
        expect(url).toEqual(documentUrl);
        expect(StubFetcher.fetch).toHaveBeenCalledWith(parentUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/turtle' },
            body: '<> a <http://xmlns.com/foaf/0.1/Person> .',
        });
    });

    it('creates container documents', async () => {
        // Arrange
        const label = Faker.random.word();
        const parentUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const containerUrl = urlResolveDirectory(parentUrl, stringToSlug(label));

        StubFetcher.addFetchResponse('', {}, 201);

        // Act
        const url = await client.createDocument(
            parentUrl,
            containerUrl,
            [
                RDFResourceProperty.literal(containerUrl, IRI('rdfs:label'), label),
                RDFResourceProperty.literal(containerUrl, IRI('purl:modified'), new Date()),
                RDFResourceProperty.type(containerUrl, IRI('ldp:Container')),
            ],
        );

        // Assert
        expect(url).toEqual(containerUrl);
        expect(StubFetcher.fetch).toHaveBeenCalledWith(containerUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/sparql-update',
                'Link': '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
                'Slug': stringToSlug(label),
                'If-None-Match': '*',
            },
            body: `INSERT DATA { <> <http://www.w3.org/2000/01/rdf-schema#label> "${label}" . }`,
        });
    });

    it('gets one document', async () => {
        // Arrange
        const url = Faker.internet.url();
        const data = `<${url}> <http://xmlns.com/foaf/0.1/name> "Foo Bar" .`;

        StubFetcher.addFetchResponse(data);

        // Act
        const document = await client.getDocument(url) as RDFDocument;

        // Assert
        expect(document).not.toBeNull();
        expect(document.requireResource(url).name).toEqual('Foo Bar');

        expect(StubFetcher.fetch).toHaveBeenCalledWith(url, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('getting non-existent document returns null', async () => {
        // Arrange
        StubFetcher.addFetchNotFoundResponse();

        // Act
        const document = await client.getDocument(Faker.internet.url());

        // Assert
        expect(document).toBeNull();
    });

    it('gets documents using a trailing slash', async () => {
        // Arrange
        const containerUrl = urlResolveDirectory(
            Faker.internet.url(),
            stringToSlug(Faker.random.word()),
        );

        StubFetcher.addFetchResponse(`
            <>
                a <http://www.w3.org/ns/ldp#Container> ;
                <http://www.w3.org/ns/ldp#contains> <foobar>, <another-container> .

            <foobar> a <https://schema.org/Thing> .
            <another-container> a <http://www.w3.org/ns/ldp#Container> .
        `);

        StubFetcher.addFetchResponse(`
            <foobar>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Foo Bar" .
        `);

        StubFetcher.addFetchResponse('<another-container> a <http://www.w3.org/ns/ldp#Container> .');

        // Act
        const documents = await client.getDocuments(containerUrl) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        expect(documents[0].url).toEqual(containerUrl + 'foobar');
        expect(documents[0].requireResource(containerUrl + 'foobar').url).toEqual(containerUrl + 'foobar');
        expect(documents[0].requireResource(containerUrl + 'foobar').name).toEqual('Foo Bar');
        expect(documents[0].requireResource(containerUrl + 'foobar').types).toEqual([IRI('foaf:Person')]);

        expect(documents[1].url).toEqual(containerUrl + 'another-container');
        expect(documents[1].requireResource(containerUrl + 'another-container').url)
            .toEqual(containerUrl + 'another-container');
        expect(documents[1].requireResource(containerUrl + 'another-container').types).toEqual([IRI('ldp:Container')]);

        expect(StubFetcher.fetch).toHaveBeenCalledTimes(3);
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(1, containerUrl, {
            headers: { Accept: 'text/turtle' },
        });
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(2, `${containerUrl}foobar`, {
            headers: { Accept: 'text/turtle' },
        });
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(3, `${containerUrl}another-container`, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('getting documents with globbing does not mix document properties', async () => {
        // Arrange
        const containerUrl = Faker.internet.url();
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
        StubFetcher.addFetchResponse(data);

        // Act
        const documents = await client.getDocuments(containerUrl) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        const fooProperties = documents[0].properties;
        expect(Object.values(fooProperties)).toHaveLength(2);
        expect(
            fooProperties.find(
                property =>
                    property.type === RDFResourcePropertyType.Type &&
                    property.value === IRI('foaf:Person'),
            ),
        )
            .not.toBeUndefined();
        expect(
            fooProperties.find(
                property =>
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Foo',
            ),
        )
            .not.toBeUndefined();

        expect(documents[1].resources).toHaveLength(2);
        expect(documents[1].requireResource(`${containerUrl}/bar`).url).toEqual(`${containerUrl}/bar`);
        expect(documents[1].resources[1]?.url).toEqual(`${containerUrl}/bar#baz`);

        const barProperties = documents[1].properties;
        expect(Object.values(barProperties)).toHaveLength(4);
        expect(
            barProperties.find(
                property =>
                    property.type === RDFResourcePropertyType.Type &&
                    property.value === IRI('foaf:Person'),
            ),
        )
            .not.toBeUndefined();
        expect(
            barProperties.find(
                property =>
                    property.resourceUrl === `${containerUrl}/bar` &&
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Bar',
            ),
        )
            .not.toBeUndefined();
        expect(
            barProperties.find(
                property =>
                    property.resourceUrl === `${containerUrl}/bar#baz` &&
                    property.type === RDFResourcePropertyType.Literal &&
                    property.name === IRI('foaf:name') &&
                    property.value === 'Baz',
            ),
        )
            .not.toBeUndefined();
    });

    it('getting container documents does not use globbing', async () => {
        // Arrange
        const containerUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const type = urlResolve(Faker.internet.url(), stringToSlug(Faker.random.word()));

        client.setConfig({ useGlobbing: true });
        StubFetcher.addFetchResponse(`
            <>
                <http://www.w3.org/ns/ldp#contains> <foo>, <bar> .
            <foo>
                a <http://www.w3.org/ns/ldp#Container> .
            <bar>
                a <http://www.w3.org/ns/ldp#Container> .
        `);
        StubFetcher.addFetchResponse(`
            <${containerUrl}foo>
                a <http://www.w3.org/ns/ldp#Container>, <${type}> ;
                <http://xmlns.com/foaf/0.1/name> "Foo" .
        `);
        StubFetcher.addFetchResponse(`
            <${containerUrl}bar>
                a <http://www.w3.org/ns/ldp#Container> ;
                <http://xmlns.com/foaf/0.1/name> "Bar" .
        `);

        // Act
        const documents = await client.getDocuments(containerUrl, true) as Tuple<RDFDocument, 2>;

        // Assert
        expect(documents).toHaveLength(2);

        expect(documents[0].url).toEqual(`${containerUrl}foo`);
        expect(documents[0].requireResource(`${containerUrl}foo`).url).toEqual(`${containerUrl}foo`);
        expect(documents[0].requireResource(`${containerUrl}foo`).name).toEqual('Foo');
        expect(documents[0].requireResource(`${containerUrl}foo`).types).toEqual([
            IRI('ldp:Container'),
            type,
        ]);

        expect(documents[1].url).toEqual(`${containerUrl}bar`);
        expect(documents[1].requireResource(`${containerUrl}bar`).url).toEqual(`${containerUrl}bar`);
        expect(documents[1].requireResource(`${containerUrl}bar`).name).toEqual('Bar');
        expect(documents[1].requireResource(`${containerUrl}bar`).types).toEqual([IRI('ldp:Container')]);

        expect(StubFetcher.fetch).toHaveBeenCalledWith(containerUrl, {
            headers: { Accept: 'text/turtle' },
        });
        expect(StubFetcher.fetch).toHaveBeenCalledWith(`${containerUrl}foo`, {
            headers: { Accept: 'text/turtle' },
        });
        expect(StubFetcher.fetch).toHaveBeenCalledWith(`${containerUrl}bar`, {
            headers: { Accept: 'text/turtle' },
        });
    });

    it('updates documents', async () => {
        // Arrange
        const documentUrl = Faker.internet.url();
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

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(documentUrl, operations);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(
            documentUrl,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/sparql-update' },
                body: expect.anything(),
            },
        );

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
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

    it('updates container documents', async () => {
        // Arrange
        const containerUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const metaDocumentName = '.' + stringToSlug(Faker.random.word());
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

        StubFetcher.addFetchResponse(data, { Link: `<${metaDocumentName}>; rel="describedBy"` });
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(containerUrl, operations);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(
            metaDocumentUrl,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/sparql-update' },
                body: expect.anything(),
            },
        );

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${containerUrl}> a <http://www.w3.org/ns/ldp#Container> .
                <${containerUrl}> <http://xmlns.com/foaf/0.1/name> "Jonathan" .
                <${containerUrl}> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <${containerUrl}> <http://xmlns.com/foaf/0.1/givenName> "John" .
            } ;
            INSERT DATA {
                <${containerUrl}> <http://xmlns.com/foaf/0.1/name> "John Doe" .
            }
        `);
    });

    it('changes resource urls', async () => {
        // Arrange
        const legacyParentUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const legacyDocumentUrl = urlResolve(legacyParentUrl, Faker.random.uuid());
        const parentUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const documentUrl = urlResolve(parentUrl, Faker.random.uuid());
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
        const operations = [
            new ChangeUrlOperation(firstResourceUrl, newFirstResourceUrl),
            new ChangeUrlOperation(secondResourceUrl, newSecondResourceUrl),
            new UpdatePropertyOperation(
                RDFResourceProperty.reference(
                    secondResourceUrl,
                    'http://xmlns.com/foaf/0.1/knows',
                    newFirstResourceUrl,
                ),
            ),
        ];

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(documentUrl, operations);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(
            documentUrl,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/sparql-update' },
                body: expect.anything(),
            },
        );

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
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
        const url = Faker.internet.url();
        const data = `<${url}> a <http://xmlns.com/foaf/0.1/Person> .`;
        const operations = [
            new UpdatePropertyOperation(RDFResourceProperty.literal(url, 'http://xmlns.com/foaf/0.1/name', 'John Doe')),
        ];

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(url, operations);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(
            url,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/sparql-update' },
                body: expect.anything(),
            },
        );

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                <> <http://xmlns.com/foaf/0.1/name> "John Doe" .
            }
        `);
    });

    it('deletes all properties from a resource within a document', async () => {
        // Arrange
        const documentUrl = Faker.internet.url();
        const url = `${documentUrl}#it`;
        const data = `
            <${documentUrl}>
                a <http://www.w3.org/ns/ldp#Resource> .
            <${url}>
                <http://xmlns.com/foaf/0.1/name> "Johnathan" ;
                <http://xmlns.com/foaf/0.1/surname> "Doe" ;
                <http://xmlns.com/foaf/0.1/givenName> "John" .
        `;

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(documentUrl, [new RemovePropertyOperation(url)]);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(
            documentUrl,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/sparql-update' },
                body: expect.anything(),
            },
        );

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "Johnathan" .
                <#it> <http://xmlns.com/foaf/0.1/surname> "Doe" .
                <#it> <http://xmlns.com/foaf/0.1/givenName> "John" .
            }
        `);
    });

    it('deletes all properties from a resource within a container document', async () => {
        // Arrange
        const documentUrl = urlResolve(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const metaDocumentUrl = `${documentUrl}.meta`;
        const resourceUrl = `${documentUrl}#it`;
        const metadataUrl = `${resourceUrl}-metadata`;
        const data = `
            <${documentUrl}>
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

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(documentUrl, [
            new RemovePropertyOperation(resourceUrl),
            new RemovePropertyOperation(metadataUrl),
        ]);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(metaDocumentUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/sparql-update' },
            body: expect.anything(),
        });

        expect(StubFetcher.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${documentUrl}> a <http://www.w3.org/ns/ldp#Container> .
                <${documentUrl}>
                    <http://purl.org/dc/terms/modified>
                        "2020-03-08T14:33:09.123Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
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
        const url = Faker.internet.url();
        const data = `<${url}> a <http://xmlns.com/foaf/0.1/Person> .`;

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchNotFoundResponse();

        // Act & Assert
        await expect(client.updateDocument(url, [new RemovePropertyOperation(url, 'foobar')]))
            .rejects
            .toThrowError(`Error updating document at ${url}, returned 404 status code`);
    });

    it('ignores empty updates', async () => {
        await client.updateDocument(Faker.internet.url(), []);

        expect(StubFetcher.fetch).not.toHaveBeenCalled();
    });

    it('updates array properties', async () => {
        // Arrange
        const personUrl = fakeResourceUrl();
        const memberUrls = range(3).map(() => fakeResourceUrl({ hash: uuid() }));
        const friendUrls = range(2).map(() => fakeResourceUrl({ hash: uuid() }));
        const fetchSpy = jest.spyOn(StubFetcher, 'fetch');

        StubFetcher.addFetchResponse();
        StubFetcher.addFetchResponse();

        // Act
        await client.updateDocument(urlRoute(personUrl), [
            new UpdatePropertyOperation(
                memberUrls.map(url => RDFResourceProperty.reference(personUrl, IRI('foaf:member'), url)),
            ),
            new UpdatePropertyOperation(
                friendUrls.map(url => RDFResourceProperty.reference(personUrl, IRI('foaf:knows'), url)),
            ),
        ]);

        // Assert
        expect(fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                ${memberUrls.map(url => `<#it> foaf:member <${url}> .`).join('\n')}
                ${friendUrls.map(url => `<#it> foaf:knows <${url}> .`).join('\n')}
            }
        `);
    });

    it('deletes non-container documents', async () => {
        // Arrange
        const url = Faker.internet.url();
        const data = `
            <${url}>
                a <http://xmlns.com/foaf/0.1/Person> ;
                <http://xmlns.com/foaf/0.1/name> "Foo Bar" .
        `;

        StubFetcher.addFetchResponse(data);
        StubFetcher.addFetchResponse();

        // Act
        await client.deleteDocument(url);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledWith(url, { method: 'DELETE' });
    });

    it('deletes container documents', async () => {
        // Arrange
        const containerUrl = urlResolveDirectory(Faker.internet.url(), stringToSlug(Faker.random.word()));
        const documentUrl = urlResolve(containerUrl, Faker.random.uuid());
        const containerData = `
            <${containerUrl}>
                a <http://www.w3.org/ns/ldp#Container> ;
                <http://www.w3.org/ns/ldp#contains> <${documentUrl}> .
        `;
        const documentData = `
            <${documentUrl}>
                a <http://xmlns.com/foaf/0.1/Person> .
        `;

        StubFetcher.addFetchResponse(containerData);
        StubFetcher.addFetchResponse(documentData);

        StubFetcher.addFetchResponse();
        StubFetcher.addFetchResponse();

        // Act
        await client.deleteDocument(containerUrl);

        // Assert
        expect(StubFetcher.fetch).toHaveBeenCalledTimes(4);
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(1, containerUrl, { headers: { Accept: 'text/turtle' } });
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(2, documentUrl, { headers: { Accept: 'text/turtle' } });
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(3, documentUrl, { method: 'DELETE' });
        expect(StubFetcher.fetch).toHaveBeenNthCalledWith(4, containerUrl, { method: 'DELETE' });
    });

    it('checks if a document exists', async () => {
        // Arrange
        const url = Faker.internet.url();

        StubFetcher.addFetchResponse(`<${url}> a <http://xmlns.com/foaf/0.1/Person> .`);

        // Act
        const exists = await client.documentExists(url);

        // Assert
        expect(exists).toBe(true);
    });

    it('checks if a document does not exist', async () => {
        // Arrange
        const url = Faker.internet.url();

        StubFetcher.addFetchNotFoundResponse();

        // Act
        const exists = await client.documentExists(url);

        // Assert
        expect(exists).toBe(false);
    });

    it('handles malformed document errors', async () => {
        // Arrange
        let error!: MalformedDocumentError;
        const url = Faker.internet.url();

        StubFetcher.addFetchResponse('this is not turtle');

        // Act
        try {
            await client.getDocument(url);
        } catch (e) {
            error = e as MalformedDocumentError;
        }

        // Assert
        expect(error).toBeInstanceOf(MalformedDocumentError);
        expect(error.message).toEqual(`Malformed RDF document found at ${url} - Unexpected "this" on line 1.`);
    });

    it('handles malformed document errors reading containers', async () => {
        // Arrange
        let error!: MalformedDocumentError;
        const containerUrl = urlResolveDirectory(
            Faker.internet.url(),
            stringToSlug(Faker.random.word()),
        );

        StubFetcher.addFetchResponse('this is not turtle');

        // Act
        try {
            await client.getDocuments(containerUrl);
        } catch (e) {
            error = e as MalformedDocumentError;
        }

        // Assert
        expect(error).toBeInstanceOf(MalformedDocumentError);
        expect(error.message).toEqual(`Malformed RDF document found at ${containerUrl} - Unexpected "this" on line 1.`);
    });

});
