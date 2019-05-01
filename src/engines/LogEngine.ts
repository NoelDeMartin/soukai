import Engine, { Attributes, Filters } from '@/engines/Engine';

export default class implements Engine {

    private engine: Engine;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public create(collection: string, attributes: Attributes, id?: string): Promise<string> {
        console.log('CREATE', collection, attributes, id);
        return this.engine.create(collection, attributes, id)
            .then(resultId => {
                console.log('CREATED', resultId);
                return resultId;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readOne(collection: string, id: string): Promise<Attributes> {
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

    public readMany(collection: string, filters?: Filters): Promise<Attributes[]> {
        console.log('READ ALL', collection, filters);
        return this.engine.readMany(collection, filters)
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
        id: string,
        dirtyAttributes: Attributes,
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

    public delete(collection: string, id: string): Promise<void> {
        console.log('DELETE', collection, id);
        return this.engine.delete(collection, id)
            .then(() => console.log('DELETED'))
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

}
