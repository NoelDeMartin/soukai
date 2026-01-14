import { RDFNamedNode, SolidStore } from '@noeldemartin/solid-utils';
import { required } from '@noeldemartin/utils';
import { ZodArray, ZodNumber } from 'zod';
import type { Quad } from '@rdfjs/types';
import type { SomeType } from 'zod/v4/core';

import { getFinalType } from 'soukai-bis/zod/utils';
import type Model from 'soukai-bis/models/Model';
import type { MintedModel, ModelConstructor } from 'soukai-bis/models/types';

function castValue(value: string, type: SomeType): unknown {
    if (type instanceof ZodNumber) {
        return Number(value);
    }

    return value;
}

export function createFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    url: string,
    quads: Quad[],
): MintedModel<T> {
    const { fields, rdfFieldProperties } = modelClass.schema;
    const subject = new RDFNamedNode(url);
    const attributes: Record<string, unknown> = {};
    const store = new SolidStore(quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        const fieldType = getFinalType(type);
        const property = rdfFieldProperties[field];
        const values = store.statements(subject, property);

        if (!property || values.length === 0) {
            continue;
        }

        if (fieldType instanceof ZodArray) {
            const itemType = getFinalType(fieldType.element);

            attributes[field] = values.map((item) => castValue(item.object.value, itemType));

            continue;
        }

        attributes[field] = castValue(required(values[0]).object.value, fieldType);
    }

    return modelClass.newInstance({ url, ...attributes }, true) as MintedModel<T>;
}
