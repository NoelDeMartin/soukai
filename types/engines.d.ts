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
interface EngineAttributeValueMap extends MapObject<EngineAttributeValue> {}
interface EngineAttributeValueArrayMap extends Array<MapObject<EngineAttributeValue>> {}

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
    { $update: EngineAttributeUpdate } |
    { $updateItems: EngineUpdateItemsOperatorData | EngineUpdateItemsOperatorData[] } |
    { $push: EngineAttributeValue };

export interface EngineUpdateItemsOperatorData {
    $where?: EngineFilters;
    $update: EngineAttributeUpdate;
}

interface EngineAttributeUpdateMap extends MapObject<EngineAttributeUpdate> {}

export type EngineDocument = MapObject<EngineAttributeValue>;
export type EngineDocumentsCollection = MapObject<EngineDocument>;
export type EngineFilters = EngineRootFilter & MapObject<EngineAttributeFilter>;
export type EngineUpdates = MapObject<EngineAttributeUpdate>;

export interface Engine {

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection>;

    update(
        collection: string,
        id: string,
        updates: EngineUpdates,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class EngineHelper {

    filterDocuments(documents: EngineDocumentsCollection, filters?: EngineFilters): EngineDocumentsCollection;

    updateAttributes(attributes: MapObject<EngineAttributeValue>, updates: EngineUpdates): void;

    removeAttributes(attributes: MapObject<EngineAttributeValue>, removedAttributes: string[][]): void;

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

    update(
        collection: string,
        id: string,
        updates: EngineUpdates,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LogEngine<InnerEngine extends Engine=Engine> implements Engine {

    readonly engine: InnerEngine;

    constructor(engine: InnerEngine);

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(
        collection: string,
        id: string,
        updates: EngineUpdates,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LocalStorageEngine implements Engine {

    constructor(prefix?: string);

    clear(): void;

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(
        collection: string,
        id: string,
        updates: EngineUpdates,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class IndexedDBEngine implements Engine {

    constructor(database?: string);

    purgeDatabase(): Promise<void>;

    closeConnections(): void;

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string): Promise<EngineDocumentsCollection>;

    update(
        collection: string,
        id: string,
        updates: EngineUpdates,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
