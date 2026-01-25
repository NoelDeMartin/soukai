import { RDFLiteral, RDFNamedNode } from '@noeldemartin/solid-utils';
import { ZodArray, ZodDate, ZodDefault, ZodNumber, ZodOptional, ZodURL } from 'zod';
import { isDevelopment } from '@noeldemartin/utils';
import type { Quad_Object } from '@rdfjs/types';
import type { SomeType } from 'zod/v4/core';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { XSD_DATE_TIME_TYPE, XSD_INTEGER_TYPE } from 'soukai-bis/utils/rdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDate(value: any): Date {
    try {
        const date = new Date(value);

        if (isNaN(date.getTime())) {
            throw new Error('Invalid date value');
        }

        return date;
    } catch {
        throw new SoukaiError(`Couldn't cast value to date: ${value}`);
    }
}

export function castToJavaScript(objects: [Quad_Object, ...Quad_Object[]], definition: SomeType): unknown {
    const finalType = getFinalType(definition);

    if (finalType instanceof ZodArray) {
        return objects.map((item) => castToJavaScript([item], finalType.def.element));
    }

    if (objects.length > 1) {
        // eslint-disable-next-line no-console
        console.warn('Multiple objects found for single value', { definition, objects });

        if (isDevelopment()) {
            throw new SoukaiError('Cannot cast multiple objects to a single value');
        }
    }

    if (finalType instanceof ZodDate) {
        return new Date(objects[0].value);
    }

    if (finalType instanceof ZodNumber) {
        return Number(objects[0].value);
    }

    return objects[0].value;
}

export function castToRDF(value: unknown, definition: SomeType): Quad_Object[] {
    const finalType = getFinalType(definition);

    if (finalType instanceof ZodArray) {
        const arrayValue = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];

        return arrayValue.flatMap((item) => castToRDF(item, finalType.def.element));
    }

    if (finalType instanceof ZodDate) {
        return [new RDFLiteral(parseDate(value).toISOString(), undefined, XSD_DATE_TIME_TYPE)];
    }

    if (finalType instanceof ZodNumber) {
        return [new RDFLiteral(String(value), undefined, XSD_INTEGER_TYPE)];
    }

    if (finalType instanceof ZodURL) {
        return [new RDFNamedNode(String(value))];
    }

    return [new RDFLiteral(String(value))];
}

export function getFinalType(type: SomeType): SomeType {
    if (type instanceof ZodOptional) {
        return getFinalType(type.def.innerType);
    }

    if (type instanceof ZodDefault) {
        return getFinalType(type.def.innerType);
    }

    return type;
}
