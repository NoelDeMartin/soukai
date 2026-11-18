import { RDFLiteral, RDFNamedNode, expandIRI } from '@noeldemartin/solid-utils';
import { serializeTerm } from 'soukai-bis/lib/internals/rdf';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ZodDate, ZodNumber, array, date, number, preprocess, string } from 'zod';

import { castToJavaScript, castToRDF, getFinalType } from './utils';

describe('Zod utils', () => {
    it('Casts integer numbers to RDF', () => {
        const [literal] = castToRDF(42, number());

        expect(literal?.value).toBe('42');
        expect(literal?.termType === 'Literal' && literal.datatype.value).toBe(
            'http://www.w3.org/2001/XMLSchema#integer',
        );
    });

    it('Casts decimal numbers to RDF', () => {
        const [literal] = castToRDF(4.5, number());

        expect(literal?.value).toBe('4.5');
        expect(literal?.termType === 'Literal' && literal.datatype.value).toBe(
            'http://www.w3.org/2001/XMLSchema#decimal',
        );
        expect(castToJavaScript([literal!], number())).toBe(4.5);
    });

    it('Unwraps wrapped types', () => {
        expect(getFinalType(date().nullable().optional().catch(undefined))).toBeInstanceOf(ZodDate);
        expect(getFinalType(preprocess((value) => value, number()).default(0))).toBeInstanceOf(ZodNumber);
        expect(
            getFinalType(
                number()
                    .transform((value) => value * 2)
                    .readonly(),
            ),
        ).toBeInstanceOf(ZodNumber);
    });

    it('Serializes values with custom casts', () => {
        const definition = array(string())
            .optional()
            .rdfCast({
                serialize: (values) => [...values.map((value) => new RDFNamedNode(value)), values.length, null],
            });

        expect(castToRDF(['https://a.example', 'https://b.example'], definition).map(serializeTerm)).toEqual([
            '<https://a.example>',
            '<https://b.example>',
            `"2"^^<${expandIRI('xsd:integer')}>`,
        ]);
    });

    it('Skips custom serializers for empty values', () => {
        const serialize = vi.fn(() => 'foo');
        const definition = array(string()).rdfCast({ serialize });

        expect(castToRDF(undefined, definition)).toEqual([]);
        expect(castToRDF([], definition)).toEqual([]);
        expect(serialize).not.toHaveBeenCalled();
    });

    it('Deserializes values with custom casts', () => {
        const deserialize = vi.fn((values: unknown[]) => values);
        const definition = number().optional().rdfCast({ deserialize });
        const one = new RDFLiteral('1', undefined, new RDFNamedNode(expandIRI('xsd:integer')));
        const two = new RDFLiteral('2', undefined, new RDFNamedNode(expandIRI('xsd:integer')));

        expect(castToJavaScript([one], definition)).toEqual([1]);
        expect(castToJavaScript([one, two], definition)).toEqual([1, 2]);
        expect(deserialize).toHaveBeenNthCalledWith(1, [1], [one]);
        expect(deserialize).toHaveBeenNthCalledWith(2, [1, 2], [one, two]);
    });
});
