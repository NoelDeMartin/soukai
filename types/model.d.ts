import { BelongsToOneRelation, HasManyRelation, MultipleModelsRelation, SingleModelRelation } from './relations';

import { Attributes as EngineAttributes, Engine, Filters } from './engines';

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

export class Model<Key = any> {

    public static collection: string;

    public static primaryKey: string;

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static modelName: string;

    public static classFields: string[];

    public static relations: string[];

    protected static instance: Model;

    protected static pureInstance: Model;

    public static boot(name: string): void;

    public static create<T extends Model>(attributes?: Attributes): Promise<T>;

    public static find<T extends Model>(id: string): Promise<T | null>;

    public static all<T extends Model>(filters?: Filters): Promise<T[]>;

    [field: string]: any;

    protected classDef: typeof Model;

    constructor(attributes?: Attributes, exists?: boolean);

    public update<T extends Model>(attributes?: Attributes): Promise<T>;

    public hasRelation(relation: string): boolean;

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

    public setExists(exists: boolean): void;

    public exists(): boolean;

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

    protected hasAutomaticTimestamp(timestamp: string): boolean;

    protected prepareEngineAttributes(engine: Engine, attributes: Attributes): EngineAttributes;

    protected prepareEngineAttributeNames(engine: Engine, names: string[]): string[];

    protected parseEngineAttributes(engine: Engine, document: EngineAttributes): Attributes;

    protected serializeKey<Key = any>(key: Key): Attributes;

    protected parseKey(key: string): Key;

}
