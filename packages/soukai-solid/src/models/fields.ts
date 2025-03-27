import type { Pretty } from '@noeldemartin/utils';
import { objectWithoutEmpty } from '@noeldemartin/utils';
import { FieldType, ModelKey, isArrayFieldDefinition } from 'soukai';
import type {
    BootedFieldDefinition,
    BootedFieldsDefinition,
    FieldDefinition,
    FieldTypeValue,
    FieldsDefinition,
    SchemaDefinition,
} from 'soukai';

export type FieldLiteralTypeValue = Exclude<FieldTypeValue, typeof FieldType.Array | typeof FieldType.Object>;

export type SolidFieldDefinition = FieldDefinition<{
    rdfProperty?: string;
    rdfPropertyAliases?: string[];
}>;
export type SolidBootedFieldDefinition = BootedFieldDefinition<{
    rdfProperty: string;
    rdfPropertyAliases: string[];
}>;
export type SolidFieldsDefinition = FieldsDefinition<{
    rdfProperty?: string;
    rdfPropertyAliases?: string[];
}>;
export type SolidBootedFieldsDefinition = BootedFieldsDefinition<{
    rdfProperty: string;
    rdfPropertyAliases: string[];
}>;
export type SolidBootedArrayFieldDefinition = Pretty<
    Omit<SolidBootedFieldDefinition, 'items'> & {
        type: typeof FieldType.Array;
        items: Omit<BootedFieldDefinition, 'required' | 'type'> & { type: FieldLiteralTypeValue };
    }
>;
export type RDFContexts = {
    default?: string | null;
} & Record<string, string>;

/* eslint-disable max-len */
export function inferFieldDefinition(
    value: unknown
): Omit<SolidBootedFieldDefinition, 'required' | 'rdfProperty' | 'rdfPropertyAliases'>;
export function inferFieldDefinition(
    value: unknown,
    rdfProperty: string,
    rdfPropertyAliases: string[],
    required: boolean
): SolidBootedFieldDefinition;
/* eslint-enable max-len */

export function inferFieldDefinition(
    value: unknown,
    rdfProperty?: string,
    rdfPropertyAliases?: string[],
    required?: boolean,
): SolidBootedFieldDefinition | Omit<SolidBootedFieldDefinition, 'required' | 'rdfProperty' | 'rdfPropertyAliases'> {
    const fieldDefinition = (type: FieldTypeValue) =>
        objectWithoutEmpty({
            type,
            rdfProperty,
            rdfPropertyAliases,
            required,
        });

    switch (typeof value) {
        case 'string':
            return fieldDefinition(FieldType.String);
        case 'number':
        case 'bigint':
            return fieldDefinition(FieldType.Number);
        case 'boolean':
            return fieldDefinition(FieldType.Boolean);
        case 'object':
            if (value === null) return fieldDefinition(FieldType.Any);

            if (value instanceof ModelKey) return fieldDefinition(FieldType.Key);

            if (value instanceof Date) return fieldDefinition(FieldType.Date);

            if (Array.isArray(value))
                return objectWithoutEmpty({
                    required,
                    rdfProperty,
                    type: FieldType.Array,
                    items: value.length > 0 ? inferFieldDefinition(value[0]) : fieldDefinition(FieldType.Any),
                });

            return objectWithoutEmpty({
                required,
                rdfProperty,
                type: FieldType.Object,
                fields: Object.entries(value).reduce(
                    (fields, [field, _value]) => {
                        fields[field] = inferFieldDefinition(_value);

                        return fields;
                    },
                    {} as Record<
                        string,
                        Omit<SolidBootedFieldDefinition, 'required' | 'rdfProperty' | 'rdfPropertyAliases'>
                    >,
                ),
            });
        default:
            return fieldDefinition(FieldType.Any);
    }
}

export function isSolidArrayFieldDefinition(
    fieldDefinition: Omit<SolidBootedFieldDefinition, 'required'>,
): fieldDefinition is SolidBootedArrayFieldDefinition {
    return isArrayFieldDefinition(fieldDefinition);
}

export type SolidSchemaDefinition = SchemaDefinition<{
    rdfProperty?: string;
    rdfPropertyAliases?: string[];
}> &
    Partial<{
        rdfContext: string;
        rdfContexts: Record<string, string>;
        rdfsClass: string;
        rdfsClasses: string[];
        rdfsClassesAliases: string[][];
        defaultResourceHash: string;
        slugField: string;
        history: boolean;
        tombstone: boolean;
    }>;
