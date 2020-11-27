import './globals';

export type EngineAttributeLeafValue =
    string |
    number |
    boolean |
    null |
    Date;

export type EngineAttributeValue =
    EngineAttributeLeafValue |
    EngineAttributeValueMap |
    EngineAttributeValueArray |
    EngineAttributeValueArrayMap;

interface EngineAttributeValueArray extends Array<EngineAttributeValue> {}
interface EngineAttributeValueMap extends Record<string, EngineAttributeValue> {}
interface EngineAttributeValueArrayMap extends Array<Record<string, EngineAttributeValue>> {}

export type EngineAttributeFilter =
    EngineAttributeValue |
    { $eq: EngineAttributeValue } |
    { $or: EngineAttributeFilter[] } |
    { $contains: EngineAttributeFilter | EngineAttributeFilter[] };

export interface EngineRootFilter {
    $in?: string[];
}

export type EngineAttributeUpdate =
    EngineAttributeValue |
    EngineAttributeUpdateMap |
    EngineAttributeUpdateOperation |
    { $apply: EngineAttributeUpdateOperation[] };

export type EngineAttributeUpdateOperation =
    { $update: EngineAttributeUpdate } |
    { $updateItems: EngineUpdateItemsOperatorData | EngineUpdateItemsOperatorData[] } |
    { $unset: string | string[] | true } |
    { $push: EngineAttributeValue };

export interface EngineUpdateItemsOperatorData {
    $where?: EngineFilters;
    $update?: EngineAttributeUpdate;
    $unset?: true;
}

interface EngineAttributeUpdateMap extends Record<string, EngineAttributeUpdate> {}

export type EngineDocument = Record<string, EngineAttributeValue>;
export type EngineDocumentsCollection = Record<string, EngineDocument>;
export type EngineFilters = EngineRootFilter & Record<string, EngineAttributeFilter>;
export type EngineUpdates = Record<string, EngineAttributeUpdate> | { $unset: string | string[] };

export interface Engine {

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class EngineHelper {

    filterDocuments(documents: EngineDocumentsCollection, filters?: EngineFilters): EngineDocumentsCollection;

    updateAttributes(attributes: Record<string, EngineAttributeValue>, updates: EngineUpdates): void;

    removeAttributes(attributes: Record<string, EngineAttributeValue>, removedAttributes: string[][]): void;

    obtainDocumentId(id?: string): string;

}

export interface InMemoryEngineDatabase {
    [collection: string]: {
        [id: string]: EngineDocument,
    };
}

export class InMemoryEngine implements Engine {

    readonly database: InMemoryEngineDatabase;

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LogEngine<InnerEngine extends Engine=Engine> implements Engine {

    readonly engine: InnerEngine;

    constructor(engine: InnerEngine);

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LocalStorageEngine implements Engine {

    constructor(prefix?: string);

    clear(): void;

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class IndexedDBEngine implements Engine {

    constructor(database?: string);

    purgeDatabase(): Promise<void>;

    closeConnections(): void;

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
