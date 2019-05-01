import Engine, { Attributes, Filters } from '@/engines/Engine';

import DocumentNotFound from '@/errors/DocumentNotFound';

interface Collection {
    totalDocuments: number;
    documents: {
        [id: string]: Attributes,
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

    public create(collectionName: string, attributes: Attributes, id?: string): Promise<string> {
        const collection = this.collection(collectionName);

        collection.totalDocuments++;

        id = id || collection.totalDocuments.toString();
        collection.documents[id] = { ...attributes, ...{ id } };

        return Promise.resolve(id);
    }

    public readOne(collectionName: string, id: string): Promise<Attributes> {
        const collection = this.collection(collectionName);
        if (id in collection.documents) {
            return Promise.resolve(collection.documents[id]);
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public readMany(collectionName: string, filters?: Filters): Promise<Attributes[]> {
        const collection = this.collection(collectionName);
        let results = Object.values(collection.documents);

        if (filters) {
            results = results.filter(result => this.filterResult(result, filters));
        }

        return Promise.resolve(results);
    }

    public update(
        collectionName: string,
        id: string,
        dirtyAttributes: Attributes,
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

    public delete(collectionName: string, id: string): Promise<void> {
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

    private filterResult(result: Attributes, filters: Filters): boolean {
        for (const field in filters) {
            if (result[field] !== filters[field]) {
                return false;
            }
        }

        return true;
    }

}
