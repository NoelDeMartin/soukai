import * as Database from './Database';

export default interface Engine {

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
