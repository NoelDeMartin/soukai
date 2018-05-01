export default interface Engine {

    create(collection: string, attributes: Soukai.Attributes): Promise<Soukai.PrimaryKey>;

    readOne(collection: string, id: Soukai.PrimaryKey): Promise<Soukai.Document>;

    readAll(collection: string): Promise<Soukai.Document[]>;

    update(collection: string, id: Soukai.PrimaryKey, attributes: Soukai.Attributes): Promise<void>;

    delete(collection: string, id: Soukai.PrimaryKey): Promise<void>;

}
