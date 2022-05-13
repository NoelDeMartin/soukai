import { MagicObject } from '@noeldemartin/utils';
import type { Constructor } from '@noeldemartin/utils';

export enum ModelFieldType {
    String = 'string',
    Number = 'number',
}

export type Attributes = Record<string, unknown>;
export type ModelFields = Record<string, ModelField>;
export type ModelField = ModelFieldType | { type: ModelFieldType; required: boolean };

export class Model extends MagicObject {

    public static fields: ModelFields = {};

    private attributes: Attributes;

    public constructor(attributes: Attributes = {}) {
        super();

        this.attributes = attributes;
    }

    protected __get(property: string): unknown {
        if (property in this.attributes) {
            return this.attributes[property];
        }

        return super.__get(property);
    }

}

export class User extends Model {

    public static fields = {
        id: {
            type: ModelFieldType.String,
            required: true,
        },
        name: ModelFieldType.String,
        age: ModelFieldType.Number,
    };

}

export function main(): void {
    const user = new User({ id: '1' }); // Should require { id: string }

    user.id; // should be string
    user.name; // should be optional string
    user.age; // should be optional number
}

// ===================================================
// V1

export type IModel<T extends typeof Model> = MagicAttributes<T['fields']>;

export class UserV1 extends Model {

    public static fields = {
        id: {
            type: ModelFieldType.String,
            required: true,
        },
        name: ModelFieldType.String,
        age: ModelFieldType.Number,
    } as const;

}

export interface UserV1 extends IModel<typeof UserV1> {}

// ===================================================
// V2

export class ExtendedModel extends Model {

    public static schema<T extends ExtendedModel, F extends ModelFields>(
        this: ModelConstructor<T>,
        fields: F,
    ): Constructor<MagicAttributes<F>> & ModelConstructor<T> {
        const ModelClass = this as typeof Model;

        return class extends ModelClass {

            public static fields = fields;

        } as unknown as Constructor<MagicAttributes<F>> & ModelConstructor<T>;
    }

}

const UserSchema = ExtendedModel.schema({
    id: {
        type: ModelFieldType.String,
        required: true,
    },
    name: ModelFieldType.String,
    age: ModelFieldType.Number,
});

export class UserV2 extends UserSchema {}

// ===================================================
// V3

// Annotations?

// ===================================================
// Helpers

export type ModelConstructor<T extends ExtendedModel = ExtendedModel> = Constructor<T> & typeof ExtendedModel;

export type MagicAttributes<T extends ModelFields> =
    MagicAttributeProperties<Pick<T, GetRequiredFields<T>>> &
    Partial<MagicAttributeProperties<Pick<T, GetOptionalFields<T>>>>;

export type GetRequiredFields<F extends ModelFields> = {
    [K in keyof F]: F[K] extends { required: true } ? K : never;
}[keyof F];

export type GetOptionalFields<F extends ModelFields> = {
    [K in keyof F]: F[K] extends { required: true } ? never : K;
}[keyof F];

export type MagicAttributeProperties<T extends ModelFields> = {
    -readonly [K in keyof T]: MagicAttributeValue<GetFieldType<T[K]>>;
};

export type GetFieldType<T extends ModelField> =
    T extends ModelFieldType ? T :
    T extends { type: ModelFieldType } ? T['type'] :
    never;

export type MagicAttributeValue<T> =
    T extends ModelFieldType.String ? string :
    T extends ModelFieldType.Number ? number :
    never;
