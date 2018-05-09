import { Database } from './engines';

export interface Attributes {
    [field: string]: any;
}

export enum FieldType {
    Number = 'number',
    String = 'string',
    Boolean = 'boolean',
    Array = 'array',
    Object = 'object',
    Date = 'date',
    Key = 'key',
}

export interface FieldsDefinition {
    [field: string]: FieldDefinition
}

export interface FieldDefinition {

    type: FieldType;
    required: boolean;

    // Only with type FieldType.Array
    items?: FieldDefinition;

    // Only with type FieldType.Object
    fields?: FieldsDefinition;

}

export class Model {

    public static collection: string;

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static boot<T extends Model>(name: string): void;

    public static create<T extends Model>(attributes?: Attributes): Promise<T>;

    public static find<T extends Model>(id: Database.Key): Promise<T | null>;

    public static all<T extends Model>(): Promise<T[]>;

    [field: string]: any;

    new(attributes?: Attributes, exists?: boolean): Model;

    public update<T extends Model>(attributes?: Attributes): Promise<T>;

    public hasAttribute(field: string): boolean;

    public setAttribute(field: string, value: any): void;

    public getAttribute(field: string): any;

    public getAttributes(includeUndefined?: boolean): Attributes;

    public unsetAttribute(field: string): void;

    public delete<T extends Model>(): Promise<T>;

    public save<T extends Model>(): Promise<T>;

    public touch(): void;

    public existsInDatabase(): boolean;

}
