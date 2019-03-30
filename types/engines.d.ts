import { Model, Attributes, Document, Key } from './model';

export interface Filters {
    [field: string]: any;
}

export interface Engine {

    create(model: typeof Model, attributes: Attributes): Promise<Key>;

    readOne(model: typeof Model, id: Key): Promise<Document>;

    readMany(model: typeof Model, filters?: Filters): Promise<Document[]>;

    update(
        model: typeof Model,
        id: Key,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Key): Promise<void>;

}

export interface InMemoryDatabase {
    [collection: string]: {
        totalDocuments: number;
        documents: {
            [id: string]: Document,
        };
    };
}

export class InMemoryEngine implements Engine {

    public readonly database: InMemoryDatabase;

    create(model: typeof Model, attributes: Attributes): Promise<Key>;

    readOne(model: typeof Model, id: Key): Promise<Document>;

    readMany(model: typeof Model): Promise<Document[]>;

    update(
        model: typeof Model,
        id: Key,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Key): Promise<void>;

}

export class LogEngine implements Engine {

    constructor(engine: Engine);

    create(model: typeof Model, attributes: Attributes): Promise<Key>;

    readOne(model: typeof Model, id: Key): Promise<Document>;

    readMany(model: typeof Model): Promise<Document[]>;

    update(
        model: typeof Model,
        id: Key,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(model: typeof Model, id: Key): Promise<void>;

}
