import { turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { md5 } from '@noeldemartin/utils';
import type { Literal } from '@rdfjs/types';
import { describe, expect, it } from 'vite-plus/test';

import RestoreOperation from './RestoreOperation';
import SetPropertyOperation from './SetPropertyOperation';
import SoftDeleteOperation from './SoftDeleteOperation';
import UnsetPropertyOperation from './UnsetPropertyOperation';

describe('SetPropertyOperation', () => {
    it('preserves types on create from RDF', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await turtleToQuads(
            `
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix schema: <https://schema.org/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#date-operation>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2026-07-12T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:startDate ;
                    crdt:value "2026-07-12T00:00:00.000Z"^^xsd:dateTime .

                <#number-operation>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2026-07-12T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:age ;
                    crdt:value 42 .

                <#url-operation>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2026-07-12T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:friend ;
                    crdt:value <#friend> .
            `,
            { baseIRI: documentUrl },
        );

        // Act
        const operations = await SetPropertyOperation.createManyFromRDF(quads);

        // Assert
        expect(operations).toHaveLength(3);

        const dateOperation = operations.find((operation) => operation.url === `${documentUrl}#date-operation`);
        expect(dateOperation?.values[0]?.termType).toBe('Literal');
        expect(dateOperation?.values[0]?.value).toBe('2026-07-12T00:00:00.000Z');
        expect((dateOperation?.values[0] as Literal)?.datatype.value).toBe('http://www.w3.org/2001/XMLSchema#dateTime');

        const numberOperation = operations.find((operation) => operation.url === `${documentUrl}#number-operation`);
        expect(numberOperation?.values[0]?.termType).toBe('Literal');
        expect(numberOperation?.values[0]?.value).toBe('42');
        expect((numberOperation?.values[0] as Literal)?.datatype.value).toBe(
            'http://www.w3.org/2001/XMLSchema#integer',
        );

        const urlOperation = operations.find((operation) => operation.url === `${documentUrl}#url-operation`);
        expect(urlOperation?.values[0]?.termType).toBe('NamedNode');
        expect(urlOperation?.values[0]?.value).toBe(`${documentUrl}#friend`);
    });

    it('mints urls from content', () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const date = new Date('2026-07-12T00:00:00.000Z');
        const createOperation = (resourceUrl: string, value: unknown[], isNamedNode: boolean = false) =>
            new SetPropertyOperation({
                resourceUrl,
                property: 'https://schema.org/name',
                value,
                date,
            }).setNamedNode(isNamedNode);

        // Act
        const operation = createOperation(`${documentUrl}#it`, ['Alice', 'Bob']);
        const url = operation.mintUrl();

        // Assert
        const expectedHash = md5(
            JSON.stringify([
                `${documentUrl}#it`,
                '2026-07-12T00:00:00.000Z',
                'https://vocab.noeldemartin.com/crdt/SetPropertyOperation',
                'https://schema.org/name',
                '"Alice"^^<http://www.w3.org/2001/XMLSchema#string>',
                '"Bob"^^<http://www.w3.org/2001/XMLSchema#string>',
            ]),
        );

        expect(url).toEqual(`${documentUrl}#it-operation-${expectedHash}`);
        expect(createOperation(`${documentUrl}#it`, ['Bob', 'Alice']).mintUrl()).toEqual(url);
        expect(createOperation(`${documentUrl}#it`, ['Alice']).mintUrl()).not.toEqual(url);
        expect(createOperation(`${documentUrl}#it`, ['Alice', 'Bob'], true).mintUrl()).not.toEqual(url);
        expect(createOperation(documentUrl, ['Alice', 'Bob']).mintUrl()).toEqual(
            `${documentUrl}#operation-${md5(
                JSON.stringify([
                    documentUrl,
                    '2026-07-12T00:00:00.000Z',
                    'https://vocab.noeldemartin.com/crdt/SetPropertyOperation',
                    'https://schema.org/name',
                    '"Alice"^^<http://www.w3.org/2001/XMLSchema#string>',
                    '"Bob"^^<http://www.w3.org/2001/XMLSchema#string>',
                ]),
            )}`,
        );
    });

    it('mints unset property urls from content', () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const operation = new UnsetPropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: 'https://schema.org/name',
            date: new Date('2026-07-12T00:00:00.000Z'),
        });

        // Act
        const url = operation.mintUrl();

        // Assert
        expect(url).toEqual(
            `${documentUrl}#it-operation-${md5(
                JSON.stringify([
                    `${documentUrl}#it`,
                    '2026-07-12T00:00:00.000Z',
                    'https://vocab.noeldemartin.com/crdt/UnsetPropertyOperation',
                    'https://schema.org/name',
                ]),
            )}`,
        );
    });

    it('mints different urls for different operation types', () => {
        // Arrange
        const resourceUrl = `${fakeDocumentUrl()}#it`;
        const date = new Date('2026-07-12T00:00:00.000Z');

        // Act
        const urls = [
            new SoftDeleteOperation({ resourceUrl, date }).mintUrl(),
            new RestoreOperation({ resourceUrl, date }).mintUrl(),
        ];

        // Assert
        expect(urls[0]).not.toEqual(urls[1]);
        expect(urls[0]).toEqual(
            `${resourceUrl}-operation-${md5(
                JSON.stringify([
                    resourceUrl,
                    '2026-07-12T00:00:00.000Z',
                    'https://vocab.noeldemartin.com/crdt/SoftDeleteOperation',
                ]),
            )}`,
        );
    });
});
