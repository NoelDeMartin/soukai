import Engine, { Database } from '@/lib/Engine';

export default class implements Engine {

    private engine: Engine;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public create(collection: string, attributes: Database.Attributes): Promise<Database.Key> {
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

    public readOne(collection: string, id: Database.Key): Promise<Database.Document> {
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

    public readMany(collection: string): Promise<Database.Document[]> {
        console.log('READ ALL', collection);
        return this.engine.readMany(collection)
            .then(documents => {
                console.log('FOUND', documents);
                return documents;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public update(
        collection: string,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void> {
        console.log('UPDATE', collection, id, dirtyAttributes, removedAttributes);
        return this.engine.update(collection, id, dirtyAttributes, removedAttributes)
            .then(() => console.log('UPDATED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public delete(collection: string, id: Database.Key): Promise<void> {
        console.log('DELETE', collection, id);
        return this.engine.delete(collection, id)
            .then(() => console.log('DELETED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

}
