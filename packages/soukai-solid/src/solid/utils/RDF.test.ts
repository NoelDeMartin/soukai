import { describe, expect, it } from 'vitest';

import RDF from './RDF';

describe('RDF helper', () => {

    it('Gets jsonld properties', () => {
        // Arrange
        const jsonlds = [
            {
                'https://schema.org/name': 'Jackpot',
            },
            {
                '@context': {
                    '@vocab': 'https://schema.org/',
                },
                'name': 'Jackpot',
            },
            {
                '@context': {
                    schema: 'https://schema.org/',
                },
                'schema:name': 'Jackpot',
            },
            {
                '@context': {
                    schema: 'https://schema.org/',
                },
                'schema:name': ['Jackpot'],
            },
            {
                '@context': {
                    schema: 'https://schema.org/',
                },
                'https://schema.org/name': ['Jackpot'],
            },
        ];

        // Act
        const results = jsonlds.map((jsonld) => RDF.getJsonLDProperty(jsonld, 'https://schema.org/name'));

        // Assert
        results.forEach((result) => expect(result).toEqual('Jackpot'));
    });

});
