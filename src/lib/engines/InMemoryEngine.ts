import Engine, { Database } from '@/lib/Engine';

import DocumentNotFound from '@/lib/errors/DocumentNotFound';

interface Collection {
    totalDocuments: number;
    documents: {
        [id: string]: Database.Document,
    };
}

export interface InMemoryDatabase {
    [collection: string]: Collection;
}

export default class implements Engine {

    private db: InMemoryDatabase = {};

    public get database(): InMemoryDatabase {
        return this.db;
    }

    public create(collectionName: string, attributes: Database.Attributes): Promise<Database.Key> {
        const collection = this.collection(collectionName);
        const id = (++collection.totalDocuments).toString();
        collection.documents[id] = { ...attributes, ...{ id } };
        return Promise.resolve(id);
    }

    public readOne(collectionName: string, id: Database.Key): Promise<Database.Document> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            return Promise.resolve(collection.documents[id]);
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public readMany(collectionName: string): Promise<Database.Document[]> {
        const collection = this.collection(collectionName);
        return Promise.resolve(Object.values(collection.documents));
    }

    public update(
        collectionName: string,
        id: Database.Key,
        dirtyAttributes: Database.Attributes,
        removedAttributes: string[],
    ): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            const document = collection.documents[id];
            collection.documents[id] = { ...document, ...dirtyAttributes };
            for (const attribute of removedAttributes) {
                delete collection.documents[id][attribute];
            }
            return Promise.resolve();
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public delete(collectionName: string, id: Database.Key): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            delete collection.documents[id];
            return Promise.resolve();
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    private collection(name: string): Collection {
        if (!(name in this.db)) {
            this.db[name] = {
                documents: {},
                totalDocuments: 0,
            };
        }

        return this.db[name];
    }

}
