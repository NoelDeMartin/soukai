export default interface Engine {

    create(collection: string, attributes: Soukai.Attributes): Promise<Soukai.PrimaryKey>;

    readOne(collection: string, id: Soukai.PrimaryKey): Promise<Soukai.Document>;

    readMany(collection: string): Promise<Soukai.Document[]>;

    update(
        collection: string,
        id: Soukai.PrimaryKey,
        dirtyAttributes: Soukai.Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: Soukai.PrimaryKey): Promise<void>;

}
