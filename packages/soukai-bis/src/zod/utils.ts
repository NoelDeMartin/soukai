import { RDFLiteral, RDFNamedNode } from '@noeldemartin/solid-utils';
import { arrayFrom, isDevelopment, isTesting, parseDate, required } from '@noeldemartin/utils';
import type { Quad_Object } from '@rdfjs/types';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    XSD_BOOLEAN,
    XSD_BOOLEAN_TYPE,
    XSD_DATE_TIME,
    XSD_DATE_TIME_TYPE,
    XSD_DECIMAL,
    XSD_INTEGER,
    createRDFLiteral,
    numberDatatype,
} from 'soukai-bis/lib/internals/rdf';
import { deepMeta, unwrapType } from 'soukai-bis/zod/soukai';
import type { ZodType } from 'zod';
import { ZodArray, ZodBoolean, ZodDate, ZodNumber, ZodURL } from 'zod';
import type { SomeType } from 'zod/v4/core';

function isRDFTerm(value: unknown): value is Quad_Object {
    return value instanceof RDFNamedNode || value instanceof RDFLiteral;
}

export function isArrayField(fieldDefinition: SomeType): boolean {
    return getFinalType(fieldDefinition) instanceof ZodArray;
}

export function isUrlField(fieldDefinition: ZodType): boolean {
    const fieldType = getFinalType(fieldDefinition);

    return (
        fieldType instanceof ZodURL ||
        (fieldType instanceof ZodArray && getFinalType(fieldType.def.element) instanceof ZodURL)
    );
}

export function hasMalformedRDFObjects(objects: Quad_Object[], definition: SomeType): boolean {
    if (deepMeta(definition as ZodType, 'rdfCast')) {
        return false;
    }

    let finalType = getFinalType(definition);

    while (finalType instanceof ZodArray) {
        if (deepMeta(finalType.def.element as ZodType, 'rdfCast')) {
            return false;
        }

        finalType = getFinalType(finalType.def.element);
    }

    if (finalType instanceof ZodURL) {
        return objects.some((object) => object.termType !== 'NamedNode');
    }

    if (finalType instanceof ZodDate) {
        return objects.some((object) => object.termType !== 'Literal' || object.datatype?.value !== XSD_DATE_TIME);
    }

    if (finalType instanceof ZodNumber) {
        return objects.some(
            (object) =>
                object.termType !== 'Literal' ||
                (object.datatype?.value !== XSD_INTEGER && object.datatype?.value !== XSD_DECIMAL),
        );
    }

    if (finalType instanceof ZodBoolean) {
        return objects.some((object) => object.termType !== 'Literal' || object.datatype?.value !== XSD_BOOLEAN);
    }

    return false;
}

export function castTermToJavaScript(term: Quad_Object): unknown {
    if (term.termType === 'Literal') {
        switch (term.datatype?.value) {
            case XSD_DATE_TIME:
                return new Date(term.value);
            case XSD_INTEGER:
            case XSD_DECIMAL:
                return Number(term.value);
            case XSD_BOOLEAN:
                return term.value === 'true' || term.value === '1';
        }
    }

    return term.value;
}

export function castToJavaScript(objects: [Quad_Object, ...Quad_Object[]], definition: SomeType): unknown {
    const deserialize = deepMeta(definition as ZodType, 'rdfCast')?.deserialize;

    if (deserialize) {
        return deserialize(objects.map(castTermToJavaScript), objects);
    }

    const finalType = getFinalType(definition);

    if (finalType instanceof ZodArray) {
        return objects.map((item) => castToJavaScript([item], finalType.def.element));
    }

    if (objects.length > 1) {
        // oxlint-disable-next-line no-console
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

    if (finalType instanceof ZodBoolean) {
        return object.value === 'true' || object.value === '1';
    }

    return castTermToJavaScript(object);
}

export function castToRDF(value: unknown, definition: SomeType): Quad_Object[] {
    const serialize = deepMeta(definition as ZodType, 'rdfCast')?.serialize;

    if (serialize) {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
            return [];
        }

        return arrayFrom(serialize(value))
            .filter((serializedValue) => serializedValue !== null && serializedValue !== undefined)
            .map((serializedValue) =>
                isRDFTerm(serializedValue) ? serializedValue : createRDFLiteral(serializedValue),
            );
    }

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
        return [new RDFLiteral(String(value), undefined, numberDatatype(Number(value)))];
    }

    if (finalType instanceof ZodBoolean) {
        return [new RDFLiteral(String(value), undefined, XSD_BOOLEAN_TYPE)];
    }

    if (finalType instanceof ZodURL) {
        return [new RDFNamedNode(String(value))];
    }

    return [new RDFLiteral(String(value))];
}

export function getFinalType(type: SomeType): SomeType {
    const innerType = unwrapType(type);

    return innerType ? getFinalType(innerType) : type;
}
