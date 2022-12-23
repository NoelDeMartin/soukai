import type { Constructor, Pretty } from '@noeldemartin/utils';

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
import type { TimestampField, TimestampsDefinition } from './timestamps';

// ---------------------------------------------------------------------------------------------------------------------
// This file contains some helpers to provide type inference in TypeScript. For people using Soukai with Javascript,
// the code within this file is irrelevant. Some helpers are used to infer the Model class in static methods. Others,
// which make the bulk of this file, are used to infer the types of magic attributes.
//
// See https://soukai.js.org/guide/defining-models.html#typescript-inference
// ---------------------------------------------------------------------------------------------------------------------

export type ModelConstructor<T extends Model = Model> = Constructor<T> & typeof Model;

export type MagicAttributes<S extends SchemaDefinition> = Pretty<
    MagicAttributeProperties<{
        // TODO this should be optional (but it's too annoying to use)
        id: typeof FieldType.String;
    }> &
    // TODO infer virtual attributes
    // TODO infer relationship attributes
    NestedMagicAttributes<GetFieldsDefinition<S>> &
    MagicTimestampAttributes<GetTimestampsDefinition<S>>
>;

export type MagicTimestampAttributes<T extends TimestampsDefinition> =
    T extends false ? {} :
    T extends typeof TimestampField.CreatedAt[] ? { createdAt: Date } :
    T extends typeof TimestampField.UpdatedAt[] ? { updatedAt: Date } :
    { createdAt: Date; updatedAt: Date };

export type NestedMagicAttributes<T extends FieldsDefinition> =
    MagicAttributeProperties<Pick<T, GetRequiredFields<T>>> &
    Partial<MagicAttributeProperties<Pick<T, GetDefinedFields<T>>>>;

export type MagicAttributeProperties<T extends FieldsDefinition> = {
    -readonly [K in keyof T]: MagicAttributeValue<GetFieldType<T[K]>>;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends typeof FieldType.Any ? any :
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

export type GetArrayFields<F extends FieldsDefinition> = {
    [K in keyof F]: F[K] extends { type: typeof FieldType.Array } ? K : never;
}[keyof F];

export type GetDefinedFields<F extends FieldsDefinition> = {
    [K in keyof F]: F[K] extends string | { type: string }
        ? K
        : F[K] extends Record<string, string>
            ? K
            : never;
}[keyof F];

export type SchemaDefinition<T = unknown> = Partial<{
    primaryKey: string;
    timestamps: TimestampsDefinition;
    fields: FieldsDefinition<T>;
}>;

export type GetFieldsDefinition<D extends SchemaDefinition> = D extends { fields: infer F } ? F : {};
export type GetTimestampsDefinition<D extends SchemaDefinition> = D extends { timestamps: infer T } ? T : true;
