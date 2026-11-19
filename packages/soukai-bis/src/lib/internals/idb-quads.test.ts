import { RDFLiteral, RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import { describe, expect, it } from 'vite-plus/test';

import { parseIDBQuads, serializeIDBQuads } from './idb-quads';

describe('IDB quad helpers', () => {
    it('serializes and deserializes named nodes, plain literals, typed literals, and language tags', () => {
        // Arrange
        const quads = [
            new RDFQuad('https://example.com/alice', 'https://example.com/name', new RDFLiteral('Alice')),
            new RDFQuad(
                'https://example.com/alice',
                'https://example.com/age',
                new RDFLiteral('42', '', new RDFNamedNode('http://www.w3.org/2001/XMLSchema#integer')),
            ),
            new RDFQuad('https://example.com/alice', 'https://example.com/bio', new RDFLiteral('Hello', 'en')),
            new RDFQuad(
                'https://example.com/alice',
                'https://example.com/friend',
                new RDFNamedNode('https://example.com/bob'),
            ),
            new RDFQuad('https://example.com/bob', 'https://example.com/name', new RDFLiteral('Bob')),
        ];

        // Act
        const serialized = serializeIDBQuads(quads);

        // Assert
        expect(serialized).toEqual({
            'https://example.com/alice': [
                { p: 'https://example.com/name', o: { v: 'Alice' } },
                {
                    p: 'https://example.com/age',
                    o: { v: '42', dt: 'http://www.w3.org/2001/XMLSchema#integer' },
                },
                { p: 'https://example.com/bio', o: { v: 'Hello', lang: 'en' } },
                { p: 'https://example.com/friend', o: 'https://example.com/bob' },
            ],
            'https://example.com/bob': [{ p: 'https://example.com/name', o: { v: 'Bob' } }],
        });

        const deserialized = parseIDBQuads(serialized);
        expect(deserialized.length).toBe(quads.length);

        for (let i = 0; i < quads.length; i++) {
            expect(deserialized[i]?.equals(quads[i])).toBe(true);
        }
    });
});
