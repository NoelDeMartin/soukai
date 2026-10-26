import { describe, expect, it } from 'vite-plus/test';
import { number } from 'zod';

import { castToJavaScript, castToRDF } from './utils';

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
});
