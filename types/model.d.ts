import { BelongsToOneRelation, HasManyRelation, MultipleModelsRelation, SingleModelRelation } from './relations';

import { Filters } from './engines';

export type Key = any;

export interface Attributes {
    [field: string]: any;
}

export interface Document extends Attributes {
    [primaryKey: string]: Key;
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

    public static primaryKey: string;

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static modelName: string;

    public static boot(name: string): void;

    public static create<T extends Model>(attributes?: Attributes): Promise<T>;

    public static find<T extends Model>(id: Key): Promise<T | null>;

    public static all<T extends Model>(filters?: Filters): Promise<T[]>;

    protected static hasAutomaticTimestamp(timestamp: string): boolean;

    [field: string]: any;

    protected classDef: typeof Model;

    constructor(attributes?: Attributes, exists?: boolean);

    public update<T extends Model>(attributes?: Attributes): Promise<T>;

    public loadRelation(relation: string): Promise<null | Model | Model[]>;

    public getRelationModels(relation: string): null | Model[] | Model;

    public setRelation(relation: string, models: null | Model | Model[]): void;

    public isRelationLoaded(relation: string): boolean;

    public hasAttribute(field: string): boolean;

    public setAttribute(field: string, value: any): void;

    public getAttribute(field: string): any;

    public getAttributes(includeUndefined?: boolean): Attributes;

    public unsetAttribute(field: string): void;

    public delete<T extends Model>(): Promise<T>;

    public save<T extends Model>(): Promise<T>;

    public touch(): void;

    public existsInDatabase(): boolean;

    protected hasMany(
        model: typeof Model,
        relatedKeyField: string,
        parentKeyField?: string,
    ): MultipleModelsRelation;

    protected belongsToOne(
        model: typeof Model,
        parentKeyField: string,
        relatedKeyField?: string,
    ): SingleModelRelation;

    protected castAttributes(attributes: Attributes, definitions: FieldsDefinition): Attributes;

    protected castAttribute(value: any, definition?: FieldDefinition): any;

}
