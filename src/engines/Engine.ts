import Model, { Attributes, Document, Key } from '@/models/Model';

export interface Filters {
    [field: string]: any;
}

export default interface Engine {

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
