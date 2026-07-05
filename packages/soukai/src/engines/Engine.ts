export type EngineAttributeLeafValue = string | number | boolean | null | Date;

export type EngineAttributeValue =
    | EngineAttributeLeafValue
    | EngineAttributeValueMap
    | EngineAttributeValueArray
    | EngineAttributeValueArrayMap;

export interface EngineAttributeValueArray extends Array<EngineAttributeValue> {}
export interface EngineAttributeValueMap extends Record<string, EngineAttributeValue> {}
export interface EngineAttributeValueArrayMap extends Array<Record<string, EngineAttributeValue>> {}

export type EngineAttributeFilter =
    | EngineAttributeValue
    | { $eq: EngineAttributeValue }
    | { $or: EngineAttributeFilter[] }
    | { $in: EngineAttributeLeafValue[] }
    | { $contains: EngineAttributeFilter | EngineAttributeFilter[] };

export interface EngineRootFilter {
    $in?: (string | number | Record<string, string | number>)[];
}

export type EngineAttributeUpdate =
    | EngineAttributeValue
    | EngineAttributeUpdateMap
    | EngineAttributeUpdateOperation
    | { $apply: EngineAttributeUpdateOperation[] };

export type EngineAttributeUpdateOperation =
    | { $update: EngineAttributeUpdate }
    | { $updateItems: EngineUpdateItemsOperatorData | EngineUpdateItemsOperatorData[] }
    | { $unset: string | string[] | true }
    | { $push: EngineAttributeValue };

export interface EngineUpdateItemsOperatorData {
    $where?: EngineFilters;
    $update?: EngineAttributeUpdate;
    $override?: EngineAttributeValueMap;
    $unset?: true;
}

export interface EngineAttributeUpdateMap extends Record<string, EngineAttributeUpdate> {}

export type EngineDocument = Record<string, EngineAttributeValue>;
export type EngineDocumentsCollection = Record<string, EngineDocument>;
export type EngineFilters = EngineRootFilter & Record<string, EngineAttributeFilter>;
export type EngineUpdates =
    | Record<string, EngineAttributeUpdate>
    | { $unset: string | string[] }
    | { $overwrite: EngineAttributeValue };

export interface Engine {
    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;
}
