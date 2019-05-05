type AttributeValue = string | number | boolean | Attributes;

export interface Attributes {
    [field: string]: AttributeValue;
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
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

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

    create(collection: string, attributes: Attributes): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string): Promise<Documents>;

    update(
        collection: string,
        id: string,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

export class LogEngine implements Engine {

    constructor(engine: Engine);

    create(collection: string, attributes: Attributes): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string): Promise<Documents>;

    update(
        collection: string,
        id: string,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}
