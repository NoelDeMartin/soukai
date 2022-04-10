import { isEmpty, isNullable, isObject, objectDeepClone } from '@noeldemartin/utils';

import SoukaiError from '@/errors/SoukaiError';

import { FieldType } from './fields';
import type { BootedFieldDefinition, BootedFieldsDefinition } from './fields';

export type Attributes = Record<string, AttributeValue>;
export type AttributeValue = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function validateAttributes(attributes: Attributes, fields: BootedFieldsDefinition): Attributes {
    for (const [field, definition] of Object.entries(fields)) {
        if (!(field in attributes)) {
            switch (definition.type) {
                case FieldType.Object:
                    attributes[field] = {};
                    break;
                case FieldType.Array:
                    attributes[field] = [];
                    break;
                default:
                    attributes[field] = undefined;
                    break;
            }
        }

        if (definition.type === FieldType.Object) {
            const value = attributes[field];

            if (!isObject(value))
                throw new SoukaiError(`Invalid value for field ${field}`);

            attributes[field] = validateAttributes(value, definition.fields);
        }
    }

    return attributes;
}

export function validateRequiredAttributes(attributes: Attributes, fields: BootedFieldsDefinition): void {
    for (const [field, definition] of Object.entries(fields)) {
        if (definition.required && (!(field in attributes) || isNullable(attributes[field])))
            throw new SoukaiError(`The ${field} attribute is required.`);

        if ((field in attributes) && !isNullable(attributes[field]) && definition.type === FieldType.Object) {
            const value = attributes[field];

            if (!isObject(value))
                throw new SoukaiError(`Invalid value for field ${field}`);

            validateRequiredAttributes(value, definition.fields);
        }
    }
}

export function removeUndefinedAttributes(attributes: Attributes, fields: BootedFieldsDefinition): Attributes {
    attributes = objectDeepClone(attributes);

    for (const field in attributes) {
        const definition = fields[field] as BootedFieldDefinition;

        if (typeof attributes[field] === 'undefined') {
            delete attributes[field];
        } else if (field in fields && definition.type === FieldType.Object) {
            const value = removeUndefinedAttributes(attributes[field] as Attributes, definition.fields);

            if (isEmpty(value)) {
                delete attributes[field];
            } else {
                attributes[field] = value;
            }
        }
    }

    return attributes;
}
