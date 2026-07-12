import { describe, expect, it } from 'vitest';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { turtleToQuads } from '@noeldemartin/solid-utils';
import type { Literal } from '@rdfjs/types';

import SetPropertyOperation from './SetPropertyOperation';

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

});
