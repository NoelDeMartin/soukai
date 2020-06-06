import { MultiModelRelation, Relation, SingleModelRelation } from './relations';

import { EngineDocument, Engine, EngineFilters, EngineUpdates } from './engines';

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

    public static instance: Model;

    protected static pureInstance: Model;

    public static boot(name: string): void;

    public static create<T extends Model>(attributes?: Attributes): Promise<T>;

    public static createFromEngineDocument<T extends Model, Key = any>(id: Key, document: EngineDocument): Promise<T>;

    public static find<T extends Model, Key = any>(id: Key): Promise<T | null>;

    public static all<T extends Model>(filters?: EngineFilters): Promise<T[]>;

    public static first<T extends Model>(filters?: EngineFilters): Promise<T|null>;

    [field: string]: any;

    protected _exists: boolean;
    protected _proxy: Model;
    protected _attributes: Attributes;
    protected _originalAttributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _relations: { [relation: string]: Relation };

    protected classDef: typeof Model;

    constructor(attributes?: Attributes, exists?: boolean);

    public update<T extends Model>(attributes?: Attributes): Promise<T>;

    public hasRelation(relation: string): boolean;

    public getRelation(relation: string): Relation | null;

    public loadRelation(relation: string): Promise<null | Model | Model[]>;

    public getRelationModels(relation: string): null | Model[] | Model;

    public setRelationModels(relation: string, models: null | Model | Model[]): void;

    public isRelationLoaded(relation: string): boolean;

    public hasAttribute(field: string): boolean;

    public setAttribute(field: string, value: any): void;

    public getAttribute(field: string): any;

    public getAttributes(includeUndefined?: boolean): Attributes;

    public unsetAttribute(field: string): void;

    public isDirty(field?: string): boolean;

    public getPrimaryKey(): Key | null;

    public getSerializedPrimaryKey(): string | null;

    public delete<T extends Model>(): Promise<T>;

    public save<T extends Model>(): Promise<T>;

    public touch(): void;

    public setExists(exists: boolean): void;

    public exists(): boolean;

    protected initialize(attributes: Attributes, exists: boolean): void;

    protected initializeProxy(): void;

    protected initializeAttributes(attributes: Attributes, exists: boolean): void;

    protected initializeRelations(): void;

    protected createFromEngineDocument<T extends Model>(id: Key, document: EngineDocument): Promise<T>;

    protected syncDirty(): Promise<string>;

    protected cleanDirty(): void;

    protected hasOne(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation;

    protected belongsTo(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation;

    protected hasMany(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation;

    protected belongsToMany(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation;

    protected castAttributes(attributes: Attributes, definitions: FieldsDefinition): Attributes;

    protected castAttribute(value: any, definition?: FieldDefinition): any;

    protected hasAutomaticTimestamp(timestamp: string): boolean;

    protected toEngineDocument(): EngineDocument;

    protected getDirtyEngineDocumentUpdates(): EngineUpdates;

    protected parseEngineDocumentAttributes(id: Key, document: EngineDocument): Promise<Attributes>;

    protected serializeKey(key: Key): string;

    protected parseKey(key: string): Key;

    protected requireRelation(relation: string): Relation;

}
