import { expandIRI, quadsToTurtle, SolidDocument, SparqlUpdate, turtleToQuads } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import { describe, expect, it } from 'vite-plus/test';

import AddPropertyOperation from './AddPropertyOperation';
import RemovePropertyOperation from './RemovePropertyOperation';
import SetPropertyOperation from './SetPropertyOperation';

describe('AddPropertyOperation', () => {
    async function documentQuads(documentUrl: string) {
        return turtleToQuads(
            `
                @prefix schema: <https://schema.org/> .
                @prefix http: <http://schema.org/> .

                <#it>
                    schema:keywords "anime", "comedy" ;
                    http:keywords "drama" ;
                    schema:actor <#alice> .

                <#other> schema:keywords "anime" .
            `,
            { baseIRI: documentUrl },
        );
    }

    it('adds values to quads', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await documentQuads(documentUrl);
        const operation = new AddPropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: expandIRI('schema:keywords'),
            value: ['comedy', 'action'],
            date: new Date(),
        });

        // Act
        const updatedQuads = operation.applyToQuads(quads);

        // Assert
        expect(quadsToTurtle(updatedQuads)).toEqualTurtle(
            `
                @prefix schema: <https://schema.org/> .
                @prefix http: <http://schema.org/> .

                <${documentUrl}#it>
                    schema:keywords "anime", "comedy", "action" ;
                    http:keywords "drama" ;
                    schema:actor <${documentUrl}#alice> .

                <${documentUrl}#other> schema:keywords "anime" .
            `,
        );
    });

    it('adds named nodes to quads', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await documentQuads(documentUrl);
        const operation = new AddPropertyOperation({
            resourceUrl: `${documentUrl}#it`,
            property: expandIRI('schema:actor'),
            value: [`${documentUrl}#alice`, `${documentUrl}#bob`],
            date: new Date(),
        }).setNamedNode(true);

        // Act
        const updatedQuads = operation.applyToQuads(quads);

        // Assert
        const actors = updatedQuads.filter((quad) => quad.predicate.value === expandIRI('schema:actor'));

        expect(actors).toHaveLength(2);
        expect(actors.every((quad) => quad.object.termType === 'NamedNode')).toBe(true);
        expect(actors.map((quad) => quad.object.value)).toEqual([`${documentUrl}#alice`, `${documentUrl}#bob`]);
    });

    it('inserts values with sparql', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const resourceUrl = `${documentUrl}#it`;
        const sparql = new SparqlUpdate(new SolidDocument(documentUrl, await documentQuads(documentUrl)));
        const operation = new AddPropertyOperation({
            resourceUrl,
            property: expandIRI('schema:keywords'),
            value: ['action'],
            date: new Date(),
        });

        // Act
        operation.applyToSparql(sparql);

        // Assert
        expect(sparql.deletes).toHaveLength(0);
        expect(sparql.inserts.map((quad) => [quad.subject.value, quad.predicate.value, quad.object.value])).toEqual([
            [resourceUrl, expandIRI('schema:keywords'), 'action'],
        ]);
    });

    it('mints urls from content', () => {
        // Arrange
        const attributes = {
            resourceUrl: `${fakeDocumentUrl()}#it`,
            property: expandIRI('schema:keywords'),
            value: ['anime'],
            date: new Date('2026-07-12T00:00:00.000Z'),
        };

        // Act
        const url = new AddPropertyOperation(attributes).mintUrl();

        // Assert
        expect(new AddPropertyOperation({ ...attributes }).mintUrl()).toEqual(url);
        expect(new AddPropertyOperation({ ...attributes, value: ['comedy'] }).mintUrl()).not.toEqual(url);
        expect(new RemovePropertyOperation(attributes).mintUrl()).not.toEqual(url);
        expect(new SetPropertyOperation(attributes).mintUrl()).not.toEqual(url);
    });

    it('reads operations from RDF', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const quads = await turtleToQuads(
            `
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix schema: <https://schema.org/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#add>
                    a crdt:AddPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "2026-07-12T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:property schema:actor ;
                    crdt:value <#alice>, <#bob> .
            `,
            { baseIRI: documentUrl },
        );

        // Act
        const operations = await AddPropertyOperation.createManyFromRDF(quads);

        // Assert
        expect(operations).toHaveLength(1);
        expect(operations[0]?.values.map((value) => value.termType)).toEqual(['NamedNode', 'NamedNode']);
        expect(operations[0]?.values.map((value) => value.value)).toEqual([
            `${documentUrl}#alice`,
            `${documentUrl}#bob`,
        ]);
    });
});
