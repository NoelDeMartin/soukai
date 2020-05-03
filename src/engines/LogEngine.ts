import Engine, {
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
} from '@/engines/Engine';

export default class LogEngine<InnerEngine extends Engine = Engine> implements Engine {

    public readonly engine: InnerEngine;

    constructor(engine: InnerEngine) {
        this.engine = engine;
    }

    public create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        console.log('CREATE', collection, document, id);
        return this.engine.create(collection, document, id)
            .then(resultId => {
                console.log('CREATED', resultId);
                return resultId;
            })
            .catch(error => {
                console.error(error);
                throw error;
            });
    }

    public readOne(collection: string, id: string): Promise<EngineDocument> {
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

    public readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
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
        updatedAttributes: EngineDocument,
        removedAttributes: string[],
    ): Promise<void> {
        console.log('UPDATE', collection, id, updatedAttributes, removedAttributes);
        return this.engine.update(collection, id, updatedAttributes, removedAttributes)
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
