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

export interface Engine {

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

export class EngineHelper {

    filterDocuments(documents: EngineDocumentsCollection, filters?: EngineFilters): EngineDocumentsCollection;

    updateAttributes(document: EngineDocument, updatedAttributes: object): void;

    removeAttributes(document: EngineDocument, removedAttributes: string[][]): void;

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
        updatedAttributes: EngineDocument,
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
        updatedAttributes: EngineDocument,
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
        updatedAttributes: EngineDocument,
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
        updatedAttributes: EngineDocument,
        removedAttributes: string[][],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
