import Engine from '../Engine';

export default class implements Engine {

    private engine: Engine;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public create(collection: string, attributes: Soukai.Attributes): Promise<Soukai.PrimaryKey> {
        console.log('CREATE', collection, attributes);
        return this.engine.create(collection, attributes)
            .then(id => {
                console.log('CREATED', id);
                return id;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readOne(collection: string, id: Soukai.PrimaryKey): Promise<Soukai.Document> {
        console.log('READ ONE', collection, id);
        return this.engine.readOne(collection, id)
            .then(document => {
                console.log('FOUND', document);
                return document;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readAll(collection: string): Promise<Soukai.Document[]> {
        console.log('READ ALL', collection);
        return this.engine.readAll(collection)
            .then(documents => {
                console.log('FOUND', documents);
                return documents;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public update(collection: string, id: Soukai.PrimaryKey, attributes: Soukai.Attributes): Promise<void> {
        console.log('UPDATE', collection, id, attributes);
        return this.engine.update(collection, id, attributes)
            .then(() => console.log('UPDATED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public delete(collection: string, id: Soukai.PrimaryKey): Promise<void> {
        console.log('DELETE', collection, id);
        return this.engine.delete(collection, id)
            .then(() => console.log('DELETED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

}
