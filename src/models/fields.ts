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
};

export const FieldRequired = {
    Required: true as const,
    Optional: false as const,
};

export const TimestampField = {
    CreatedAt: 'createdAt' as const,
    UpdatedAt: 'updatedAt' as const,
};

export type FieldTypeValue = typeof FieldType[keyof typeof FieldType];
export type TimestampFieldValue = typeof TimestampField[keyof typeof TimestampField];

export const TIMESTAMP_FIELDS = Object.values(TimestampField);
export const FIELD_TYPES = Object.values(FieldType);

export type FieldsDefinition = Record<string, FieldDefinition>;
export type FieldDefinition =
    BasicFieldDefinition |
    ArrayFieldDefinition |
    ObjectFieldDefinition |
    FieldTypeValue |
    Record<string, FieldTypeValue>;

export interface FieldDefinitionBase {
    required?: boolean;
}

export interface BasicFieldDefinition extends FieldDefinitionBase {
    type: Exclude<FieldTypeValue, typeof FieldType.Array | typeof FieldType.Object>;
}

export interface ArrayFieldDefinition extends FieldDefinitionBase {
    type: typeof FieldType.Array;
    items: Omit<FieldDefinition, 'required'>;
}

export interface ObjectFieldDefinition extends FieldDefinitionBase {
    type: typeof FieldType.Object;
    fields: FieldsDefinition;
}

export type BootedFieldsDefinition = Record<string, BootedFieldDefinition>;
export type BootedFieldDefinition =
    BootedBasicFieldDefinition |
    BootedArrayFieldDefinition |
    BootedObjectFieldDefinition;

export interface BootedFieldDefinitionBase {
    required: boolean;
}

export interface BootedBasicFieldDefinition extends BootedFieldDefinitionBase {
    type: Exclude<FieldTypeValue, typeof FieldType.Array | typeof FieldType.Object>;
}

export interface BootedArrayFieldDefinition extends BootedFieldDefinitionBase {
    type: typeof FieldType.Array;
    items: Omit<BootedFieldDefinition, 'required'>;
}

export interface BootedObjectFieldDefinition extends BootedFieldDefinitionBase {
    type: typeof FieldType.Object;
    fields: BootedFieldsDefinition;
}

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
