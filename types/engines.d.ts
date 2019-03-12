import { Model } from './model';

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

    create(model: typeof Model, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(model: typeof Model, id: Database.Key): Promise<Database.Document>;

    readMany(model: typeof Model): Promise<Database.Document[]>;

    update(
        model: typeof Model,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Database.Key): Promise<void>;

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

    create(model: typeof Model, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(model: typeof Model, id: Database.Key): Promise<Database.Document>;

    readMany(model: typeof Model): Promise<Database.Document[]>;

    update(
        model: typeof Model,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Database.Key): Promise<void>;

}

export class LogEngine implements Engine {

    constructor(engine: Engine);

    create(model: typeof Model, attributes: Database.Attributes): Promise<Database.Key>;

    readOne(model: typeof Model, id: Database.Key): Promise<Database.Document>;

    readMany(model: typeof Model): Promise<Database.Document[]>;

    update(
        model: typeof Model,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Database.Key): Promise<void>;

}
