import { objectHasOwnProperty } from '@noeldemartin/utils';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';

// ---------------------------------------------------------------------------------------------------------------------
// There are two types of field definitions: the ones used for defining a Model and the ones used at runtime (called
// "booted" in this file). The ones used to define a Model are a subset of the ones used at runtime, but it isn't
// straightforward to merge both declarations, so it was easier to just duplicate some code.
//
// See https://soukai.js.org/guide/defining-models.html#fields
// ---------------------------------------------------------------------------------------------------------------------

export const FieldType = {
    Number: 'number' as const,
    String: 'string' as const,
    Boolean: 'boolean' as const,
    Array: 'array' as const,
    Object: 'object' as const,
    Date: 'date' as const,
    Key: 'key' as const,
    Any: 'any' as const,
};

export const FieldRequired = {
    Required: true as const,
    Optional: false as const,
};

export type FieldTypeValue = typeof FieldType[keyof typeof FieldType];

export const FIELD_TYPES = Object.values(FieldType);

export type FieldsDefinition<T = unknown> = Record<string, FieldDefinition<T>>;
export type FieldDefinition<T = unknown> =
    BasicFieldDefinition<T> |
    ArrayFieldDefinition<T> |
    ObjectFieldDefinition<T> |
    FieldTypeValue |
    Record<string, FieldTypeValue>;

export type FieldDefinitionBase<T = unknown> = T & {
    required?: boolean;
};

export type BasicFieldDefinition<T = unknown> = FieldDefinitionBase<T> & {
    type: Exclude<FieldTypeValue, typeof FieldType.Array | typeof FieldType.Object>;
};

export type ArrayFieldDefinition<T = unknown> = FieldDefinitionBase<T> & {
    type: typeof FieldType.Array;
    items: Omit<FieldDefinition<T>, 'required'>;
};

export type ObjectFieldDefinition<T = unknown> = FieldDefinitionBase<T> & {
    type: typeof FieldType.Object;
    fields: FieldsDefinition<T>;
};

export type BootedFieldsDefinition<T = unknown> = Record<string, BootedFieldDefinition<T>>;
export type BootedFieldDefinition<T = unknown> =
    BootedBasicFieldDefinition<T> |
    BootedArrayFieldDefinition<T> |
    BootedObjectFieldDefinition<T>;

export type BootedFieldDefinitionBase<T = unknown> = T & {
    required: boolean;
};

export type BootedBasicFieldDefinition<T = unknown> = BootedFieldDefinitionBase<T> & {
    type: Exclude<FieldTypeValue, typeof FieldType.Array | typeof FieldType.Object>;
};

export type BootedArrayFieldDefinition<T = unknown> = BootedFieldDefinitionBase<T> & {
    type: typeof FieldType.Array;
    items: Omit<BootedFieldDefinition<T>, 'required'>;
};

export type BootedObjectFieldDefinition<T = unknown> = BootedFieldDefinitionBase<T> & {
    type: typeof FieldType.Object;
    fields: BootedFieldsDefinition<T>;
};

export function expandFieldDefinition(
    model: string,
    field: string,
    definition: FieldDefinition,
    isArrayItem: boolean = false,
): BootedFieldDefinition {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fieldDefinition = {} as any;

    if (typeof definition === 'string' && FIELD_TYPES.indexOf(definition) !== -1)
        fieldDefinition.type = definition;
    else if (typeof definition === 'object')
        fieldDefinition = definition;
    else
        throw new InvalidModelDefinition(model, `Invalid field definition ${field}`);

    if (typeof fieldDefinition.type === 'undefined')
        fieldDefinition = {
            type: FieldType.Object,
            fields: fieldDefinition,
        } as ObjectFieldDefinition;
    else if (FIELD_TYPES.indexOf(fieldDefinition.type) === -1)
        throw new InvalidModelDefinition(model, `Invalid field definition ${field}`);

    if (!isArrayItem)
        fieldDefinition.required = !!fieldDefinition.required;

    switch (fieldDefinition.type) {
        case FieldType.Object:
            if (typeof fieldDefinition.fields === 'undefined')
                throw new InvalidModelDefinition(
                    model,
                    `Field definition of type object requires fields attribute ${field}`,
                );

            for (const f in fieldDefinition.fields) {
                if (objectHasOwnProperty(fieldDefinition.fields, f)) {
                    fieldDefinition.fields[f] = expandFieldDefinition(model, f, fieldDefinition.fields[f]);
                }
            }
            break;
        case FieldType.Array:
            if (typeof fieldDefinition.items === 'undefined')
                throw new InvalidModelDefinition(
                    model,
                    `Field definition of type array requires items attribute. Field: '${field}'`,
                );

            fieldDefinition.items = expandFieldDefinition(
                model,
                'items',
                fieldDefinition.items,
                true,
            );
            break;
    }

    return fieldDefinition;
}

/* eslint-disable max-len */
export function isArrayFieldDefinition(fieldDefinition: BootedFieldDefinition): fieldDefinition is BootedArrayFieldDefinition;
export function isArrayFieldDefinition(fieldDefinition: Omit<BootedFieldDefinition, 'required'>): fieldDefinition is Omit<BootedArrayFieldDefinition, 'required'>;
/* eslint-enable max-len */

export function isArrayFieldDefinition(fieldDefinition: { type: FieldTypeValue }): boolean {
    return fieldDefinition.type === FieldType.Array;
}

/* eslint-disable max-len */
export function isObjectFieldDefinition(fieldDefinition: BootedFieldDefinition): fieldDefinition is BootedObjectFieldDefinition;
export function isObjectFieldDefinition(fieldDefinition: Omit<BootedFieldDefinition, 'required'>): fieldDefinition is Omit<BootedObjectFieldDefinition, 'required'>;
/* eslint-enable max-len */

export function isObjectFieldDefinition(fieldDefinition: { type: FieldTypeValue }): boolean {
    return fieldDefinition.type === FieldType.Object;
}
