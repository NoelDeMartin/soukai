import { describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';

import RDFDocument from './RDFDocument';
import { fakeDocumentUrl } from '@noeldemartin/testing';

describe('RDFDocument', () => {

    it('parses Turtle', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const name = faker.name.firstName();

        // Act
        const document = await RDFDocument.fromTurtle(
            `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <${url}>
                a foaf:Person ;
                foaf:name "${name}" .
        `,
            { baseIRI: url },
        );

        // Assert
        expect(document.statements).toHaveLength(2);
        expect(document.url).toEqual(url);
        expect(document.requireResource(url).url).toEqual(url);
        expect(document.requireResource(url).isType('foaf:Person')).toBe(true);
        expect(document.requireResource(url).getPropertyValue('foaf:name')).toEqual(name);
    });

    it('parses JSON-LD', async () => {
        // Arrange
        const url = fakeDocumentUrl();
        const name = faker.name.firstName();

        // Act
        const document = await RDFDocument.fromJsonLD({
            '@id': url,
            '@context': { '@vocab': 'http://xmlns.com/foaf/0.1/' },
            '@type': ['Person'],
            'name': name,
        });

        // Assert
        expect(document.statements).toHaveLength(2);
        expect(document.url).toEqual(url);
        expect(document.requireResource(url).url).toEqual(url);
        expect(document.requireResource(url).isType('foaf:Person')).toBe(true);
        expect(document.requireResource(url).getPropertyValue('foaf:name')).toEqual(name);
    });

});
