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

interface EngineAttributeUpdateMap extends MapObject<EngineAttributeUpdate> {}

export type EngineDocument = MapObject<EngineAttributeValue>;
export type EngineDocumentsCollection = MapObject<EngineDocument>;
export type EngineFilters = EngineRootFilter & MapObject<EngineAttributeFilter>;
export type EngineUpdates = MapObject<EngineAttributeUpdate> | { $unset: string | string[] };

export default interface Engine {

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection>;

    update(collection: string, id: string, updates: EngineUpdates): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
