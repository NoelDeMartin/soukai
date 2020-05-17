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
    { $updateItems: { $where?: EngineFilters, $update: EngineAttributeUpdate } } |
    { $push: EngineAttributeValue };

interface EngineAttributeUpdateMap extends MapObject<EngineAttributeUpdate> {}

export type EngineDocument = MapObject<EngineAttributeValue>;
export type EngineDocumentsCollection = MapObject<EngineDocument>;
export type EngineFilters = EngineRootFilter & MapObject<EngineAttributeFilter>;
export type EngineUpdates = MapObject<EngineAttributeUpdate>;

export default interface Engine {

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
