import { RDFLiteral, RDFNamedNode } from '@noeldemartin/solid-utils';
import { ZodArray, ZodDate, ZodDefault, ZodNumber, ZodOptional, ZodURL } from 'zod';
import { isDevelopment, isTesting, parseDate, required } from '@noeldemartin/utils';
import type { Quad_Object } from '@rdfjs/types';
import type { SomeType } from 'zod/v4/core';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { XSD_BOOLEAN, XSD_DATE_TIME, XSD_DATE_TIME_TYPE, XSD_INTEGER, XSD_INTEGER_TYPE } from 'soukai-bis/utils/rdf';

export function castToJavaScript(objects: [Quad_Object, ...Quad_Object[]], definition: SomeType): unknown {
    const finalType = getFinalType(definition);

    if (finalType instanceof ZodArray) {
        return objects.map((item) => castToJavaScript([item], finalType.def.element));
    }

    if (objects.length > 1) {
        // eslint-disable-next-line no-console
        console.warn('Multiple objects found for single value', { definition, objects });

        if (isDevelopment() || isTesting()) {
            throw new SoukaiError('Cannot cast multiple objects to a single value');
        }
    }

    const object = objects[0];

    if (finalType instanceof ZodDate) {
        return new Date(object.value);
    }

    if (finalType instanceof ZodNumber) {
        return Number(object.value);
    }

    if (object.termType === 'Literal') {
        switch (object.datatype?.value) {
            case XSD_DATE_TIME:
                return new Date(object.value);
            case XSD_INTEGER:
                return Number(object.value);
            case XSD_BOOLEAN:
                return object.value === 'true';
        }
    }

    return object.value;
}

export function castToRDF(value: unknown, definition: SomeType): Quad_Object[] {
    const finalType = getFinalType(definition);

    if (finalType instanceof ZodArray) {
        const arrayValue = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];

        return arrayValue.flatMap((item) => castToRDF(item, finalType.def.element));
    }

    if (finalType instanceof ZodDate) {
        return [
            new RDFLiteral(
                required(parseDate(value), 'Invalid date value').toISOString(),
                undefined,
                XSD_DATE_TIME_TYPE,
            ),
        ];
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
