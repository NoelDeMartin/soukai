import type { Key, Model } from './Model';

import type {
    ArrayFieldDefinition,
    BasicFieldDefinition,
    FieldDefinition,
    FieldType,
    FieldTypeValue,
    FieldsDefinition,
    ObjectFieldDefinition,
} from './fields';

// ---------------------------------------------------------------------------------------------------------------------
// This file contains some helpers to provide type inference in TypeScript. For people using Soukai with Javascript,
// the code within this file is irrelevant. Some helpers are used to infer the Model class in static methods. Others,
// which make the bulk of this file, are used to infer the types of magic attributes.
//
// See https://soukai.js.org/guide/defining-models.html#typescript-inference
// ---------------------------------------------------------------------------------------------------------------------

export type Constructor<T> = { new (...args: any[]): T };
export type ModelConstructor<T extends Model> = Constructor<T> & typeof Model;

export type MagicAttributes<T extends FieldsDefinition> =
    MagicAttributeProperties<{
        id: typeof FieldType.String;
        createdAt: typeof FieldType.Date;
        updatedAt: typeof FieldType.Date;
    }> &
    // TODO infer virtual attributes
    // TODO infer relationship attributes
    NestedMagicAttributes<T>;

export type NestedMagicAttributes<T extends FieldsDefinition> =
    MagicAttributeProperties<Pick<T, GetRequiredFields<T>>> &
    Partial<MagicAttributeProperties<Pick<T, GetOptionalFields<T>>>>;

export type MagicAttributeProperties<T extends FieldsDefinition> = {
    [K in keyof T]: MagicAttributeValue<GetFieldType<T[K]>>;
};

export type MagicAttributeValue<T> =
    T extends FieldsDefinition ? NestedMagicAttributes<T> :
    T extends FieldTypeValue ? ResolveFieldType<T> :
    T extends Array<infer R>
        ? R extends FieldTypeValue
            ? ResolveFieldType<R>[]
            : never
    : never;

export type ResolveFieldType<T extends FieldTypeValue> =
    T extends typeof FieldType.Number ? number :
    T extends typeof FieldType.String ? string :
    T extends typeof FieldType.Boolean ? boolean :
    T extends typeof FieldType.Date ? Date :
    T extends typeof FieldType.Key ? Key :
    never;

export type GetFieldType<T extends FieldDefinition> =
    T extends FieldTypeValue ? T :
    T extends BasicFieldDefinition ? T['type'] :
    T extends ArrayFieldDefinition ? T['items'][] :
    T extends ObjectFieldDefinition ? T['fields'] :
    T;

export type GetRequiredFields<F extends FieldsDefinition> = {
    [K in keyof F]: F[K] extends { required: true } ? K : never;
}[keyof F];

export type GetOptionalFields<F extends FieldsDefinition> = {
    [K in keyof F]: F[K] extends { required: true } ? never : K;
}[keyof F];
