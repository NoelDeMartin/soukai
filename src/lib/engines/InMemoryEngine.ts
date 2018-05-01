import ModelNotFound from '../errors/ModelNotFound';
import Engine from '../Engine';

interface Collection {
    incrementalCount: number;
    documents: {
        [id: string]: Soukai.Document,
    };
}

export default class implements Engine {

    private db: { [collection: string]: Collection } = {};

    public create(collectionName: string, attributes: Soukai.Attributes): Promise<Soukai.PrimaryKey> {
        const collection = this.collection(collectionName);
        const id = (collection.incrementalCount++).toString();
        collection.documents[id] = { ...{ id }, ...attributes.id };
        return Promise.resolve(id);
    }

    public readOne(collectionName: string, id: Soukai.PrimaryKey): Promise<Soukai.Document> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            return Promise.resolve(collection.documents[id]);
        } else {
            return Promise.reject(new ModelNotFound(id));
        }
    }

    public readAll(collectionName: string): Promise<Soukai.Document[]> {
        const collection = this.collection(collectionName);
        return Promise.resolve(Object.values(collection.documents));
    }

    public update(collectionName: string, id: Soukai.PrimaryKey, attributes: Soukai.Attributes): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            const document = collection.documents[id];
            collection.documents[id] = { ...document, ...attributes };
            return Promise.resolve();
        } else {
            return Promise.reject(new ModelNotFound(id));
        }
    }

    public delete(collectionName: string, id: Soukai.PrimaryKey): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            delete collection.documents[id];
            return Promise.resolve();
        } else {
            return Promise.reject(new ModelNotFound(id));
        }
    }

    private collection(name: string): Collection {
        if (!(name in this.db)) {
            this.db[name] = {
                documents: {},
                incrementalCount: 0,
            };
        }

        return this.db[name];
    }

}
