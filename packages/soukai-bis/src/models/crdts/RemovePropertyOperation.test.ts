import {
    expandIRI,
    quadsToTurtle,
    RDFNamedNode,
    SolidDocument,
    SparqlUpdate,
    turtleToQuads,
} from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import type { Quad } from '@rdfjs/types';
import { CRDT_VALUE } from 'soukai-bis/lib/internals/rdf';
import { setRDFPrefixAliases } from 'soukai-bis/lib/rdf-prefix-aliases';
import { HTTP_SCHEMA } from 'soukai-bis/testing/constants';
import { describe, expect, it } from 'vite-plus/test';

import type PropertyOperation from './PropertyOperation';
import RemovePropertyOperation from './RemovePropertyOperation';
import SetPropertyOperation from './SetPropertyOperation';
import { keywordsDocumentQuads } from './testing/helpers';

describe('RemovePropertyOperation', () => {
    it('removes values from quads with IRI variants', async () => {
        // Arrange
        setRDFPrefixAliases({ 'https://schema.org/': HTTP_SCHEMA });

        const documentUrl = fakeDocumentUrl();
        const quads = await keywordsDocumentQuads(documentUrl);
        const operation = new RemovePropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: expandIRI('schema:keywords'),
            value: ['anime', 'drama', 'action'],
            date: new Date(),
        });

        // Act
        const updatedQuads = operation.applyToQuads(quads);

        // Assert
        expect(quadsToTurtle(updatedQuads)).toEqualTurtle(
            `
                @prefix schema: <https://schema.org/> .

                <${documentUrl}#it>
                    schema:keywords "comedy" ;
                    schema:actor <${documentUrl}#alice> .

                <${documentUrl}#other> schema:keywords "anime" .
            `,
        );
    });

    it('removes named nodes from quads', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await keywordsDocumentQuads(documentUrl);
        const operation = new RemovePropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: expandIRI('schema:actor'),
            value: [`${documentUrl}#alice`],
            date: new Date(),
        }).setNamedNode(true);

        // Act
        const updatedQuads = operation.applyToQuads(quads);

        // Assert
        expect(updatedQuads.some((quad) => quad.predicate.value === expandIRI('schema:actor'))).toBe(false);
    });

    it('deletes values with sparql using IRI variants', async () => {
        // Arrange
        setRDFPrefixAliases({ 'https://schema.org/': HTTP_SCHEMA });

        const documentUrl = fakeDocumentUrl();
        const resourceUrl = `${documentUrl}#it`;
        const sparql = new SparqlUpdate(new SolidDocument(documentUrl, await keywordsDocumentQuads(documentUrl)));
        const operation = new RemovePropertyOperation({
            resourceUrl,
            property: expandIRI('schema:keywords'),
            value: ['anime', 'drama'],
            date: new Date(),
        });

        // Act
        operation.applyToSparql(sparql);

        // Assert
        expect(sparql.inserts).toHaveLength(0);
        expect(sparql.deletes.map((quad) => [quad.subject.value, quad.predicate.value, quad.object.value])).toEqual(
            expect.arrayContaining([
                [resourceUrl, expandIRI('schema:keywords'), 'anime'],
                [resourceUrl, `${HTTP_SCHEMA}keywords`, 'drama'],
            ]),
        );
        expect(sparql.deletes).toHaveLength(2);
    });

    it('creates document operations with set operations for values', () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const operation = new RemovePropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: expandIRI('schema:actor'),
            value: [`${documentUrl}#alice`, `${documentUrl}#bob`],
            date: new Date('2026-07-12T00:00:00.000Z'),
        }).setNamedNode(true);

        operation.mintUrl();

        // Act
        const documentOperations = operation.createDocumentOperations() as PropertyOperation[];

        // Assert
        const valueOperation = documentOperations.find(
            (documentOperation) => documentOperation.property === CRDT_VALUE,
        );
        const quads = documentOperations.reduce<Quad[]>(
            (documentQuads, documentOperation) => documentOperation.applyToQuads(documentQuads),
            [],
        );

        expect(valueOperation).toBeInstanceOf(SetPropertyOperation);
        expect((valueOperation as SetPropertyOperation).values).toEqual([
            new RDFNamedNode(`${documentUrl}#alice`),
            new RDFNamedNode(`${documentUrl}#bob`),
        ]);
        expect(quadsToTurtle(quads)).toEqualTurtle(
            `
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix schema: <https://schema.org/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <${operation.url}>
                    a crdt:RemovePropertyOperation ;
                    crdt:resource <${documentUrl}#it> ;
                    crdt:date "2026-07-12T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:actor ;
                    crdt:value <${documentUrl}#alice>, <${documentUrl}#bob> .
            `,
        );
    });

    it('reads operations from RDF', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await turtleToQuads(
            `
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix schema: <https://schema.org/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#remove>
                    a crdt:RemovePropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2026-07-13T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:keywords ;
                    crdt:value "anime" .
            `,
            { baseIRI: documentUrl },
        );

        // Act
        const operations = await RemovePropertyOperation.fromRDF(quads).all();

        // Assert
        expect(operations).toHaveLength(1);
        expect(operations[0]?.values[0]?.termType).toEqual('Literal');
        expect(operations[0]?.values[0]?.value).toEqual('anime');
    });
});
