import Model, { Attributes, Document, Key } from '@/lib/Model';

export default interface Engine {

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
