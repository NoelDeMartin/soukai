import { ZodArray, ZodDefault, ZodOptional, ZodURL } from 'zod';
import { RDFLiteral, RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import type { SomeType } from 'zod/v4/core';

import { RDF_TYPE } from 'soukai-bis/models/constants';
import type Model from 'soukai-bis/models/Model';

function getFinalType(type: SomeType): SomeType {
    if (type instanceof ZodOptional) {
        return getFinalType(type.def.innerType);
    }

    if (type instanceof ZodDefault) {
        return getFinalType(type.def.innerType);
    }

    return type;
}

function castValue(value: unknown, type: SomeType): Quad_Object[] {
    const finalType = getFinalType(type);

    if (finalType instanceof ZodArray) {
        const arrayValue = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];

        return arrayValue.flatMap((item) => castValue(item, finalType.def.element));
    }

    if (finalType instanceof ZodURL) {
        return [new RDFNamedNode(String(value))];
    }

    return [new RDFLiteral(String(value))];
}

export function serializeToRDF(model: Model): Quad[] {
    const { fields, rdfDefaultResourceHash, rdfClasses, rdfFieldProperties } = model.static().schema;
    const subject = new RDFNamedNode(model.url ?? `#${rdfDefaultResourceHash}`);
    const statements: Quad[] = [];

    for (const rdfClass of rdfClasses) {
        statements.push(new RDFQuad(subject, RDF_TYPE, rdfClass));
    }

    for (const [field, value] of Object.entries(model.getAttributes())) {
        for (const object of castValue(value, fields.def.shape[field])) {
            statements.push(new RDFQuad(subject, rdfFieldProperties[field], object));
        }
    }

    return statements;
}
