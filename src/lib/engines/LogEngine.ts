import Engine from '@/lib/Engine';
import Model, { Key, Document, Attributes } from '@/lib/Model';

export default class implements Engine {

    private engine: Engine;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public create(model: typeof Model, attributes: Attributes): Promise<Key> {
        console.log('CREATE', model.collection, attributes);
        return this.engine.create(model, attributes)
            .then(id => {
                console.log('CREATED', id);
                return id;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readOne(model: typeof Model, id: Key): Promise<Document> {
        console.log('READ ONE', model.collection, id);
        return this.engine.readOne(model, id)
            .then(document => {
                console.log('FOUND', document);
                return document;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readMany(model: typeof Model): Promise<Document[]> {
        console.log('READ ALL', model.collection);
        return this.engine.readMany(model)
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
        model: typeof Model,
        id: Key,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void> {
        console.log('UPDATE', model.collection, id, dirtyAttributes, removedAttributes);
        return this.engine.update(model, id, dirtyAttributes, removedAttributes)
            .then(() => console.log('UPDATED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public delete(model: typeof Model, id: Key): Promise<void> {
        console.log('DELETE', model.collection, id);
        return this.engine.delete(model, id)
            .then(() => console.log('DELETED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

}
