type EngineAttributePrimitiveValue =
    string |
    number |
    boolean |
    null |
    Date;

type EngineAttributeValue =
    EngineAttributePrimitiveValue[] |
    EngineAttributePrimitiveValue |
    { [attribute: string]: EngineAttributeValue } |
    Array<{ [attribute: string]: EngineAttributeValue }>;

export interface EngineDocument {
    [field: string]: EngineAttributeValue;
}

export interface EngineDocumentsCollection {
    [id: string]: EngineDocument;
}

export interface EngineFilters {
    $in?: string[];

    [field: string]:
        { $contains: any[] } |
        any;
}

export default interface Engine {

    create(collection: string, document: EngineDocument, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineDocument>;

    readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection>;

    update(
        collection: string,
        id: string,
        updatedAttributes: EngineDocument,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
