type AttributePrimitiveValue = string | number | boolean | null | Date;

type AttributeValue = AttributePrimitiveValue | AttributePrimitiveValue[];

export interface Attributes {
    [field: string]: AttributeValue | Attributes | Attributes[];
}

export interface Documents {
    [id: string]: Attributes;
}

export interface Filters {
    [field: string]: any;
}

export interface Engine {

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string, filters?: Filters): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class EngineHelper {

    filterDocuments(documents: Documents, filters?: Filters): Documents;

    getDocumentId(id?: string): string;

}

export interface InMemoryDatabase {
    [collection: string]: {
        totalAttributess: number;
        Attributess: {
            [id: string]: Attributes,
        };
    };
}

export class InMemoryEngine implements Engine {

    public readonly database: InMemoryDatabase;

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LogEngine implements Engine {

    constructor(engine: Engine);

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LocalStorageEngine implements Engine {

    constructor(prefix?: string);

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
