export namespace Database {

    type Key = string;

    type Value = string | number | boolean | Key;

    interface Attributes {
        [field: string]: Value | Value[] | Attributes;
    }

    interface Document extends Attributes {
        id: Key;
    }

}

export interface Engine {

    create(collection: string, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(collection: string, id: Database.Key): Promise<Database.Document>;

    readMany(collection: string): Promise<Database.Document[]>;

    update(
        collection: string,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: Database.Key): Promise<void>;

}

export interface InMemoryDatabase {
    [collection: string]: {
        totalDocuments: number;
        documents: {
            [id: string]: Database.Document,
        };
    };
}

export class InMemoryEngine implements Engine {

    public readonly database: InMemoryDatabase;

    create(collection: string, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(collection: string, id: Database.Key): Promise<Database.Document>;

    readMany(collection: string): Promise<Database.Document[]>;

    update(
        collection: string,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: Database.Key): Promise<void>;

}

export class LogEngine implements Engine {

    new(engine: Engine): LogEngine;

    create(collection: string, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(collection: string, id: Database.Key): Promise<Database.Document>;

    readMany(collection: string): Promise<Database.Document[]>;

    update(
        collection: string,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: Database.Key): Promise<void>;

}
