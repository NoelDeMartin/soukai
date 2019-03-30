import Engine, { Filters } from '@/engines/Engine';
import Model, { Attributes, Document, Key } from '@/models/Model';

import DocumentNotFound from '@/errors/DocumentNotFound';

interface Collection {
    totalDocuments: number;
    documents: {
        [id: string]: Document,
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

    public create(model: typeof Model, attributes: Attributes): Promise<Key> {
        const collection = this.collection(model.collection);
        collection.totalDocuments++;

        const id = attributes.id || collection.totalDocuments.toString();
        collection.documents[id] = { ...attributes, ...{ id } };

        return Promise.resolve(id);
    }

    public readOne(model: typeof Model, id: Key): Promise<Document> {
        const collection = this.collection(model.collection);
        if (id in collection.documents) {
            return Promise.resolve(collection.documents[id]);
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public readMany(model: typeof Model, filters?: Filters): Promise<Document[]> {
        const collection = this.collection(model.collection);
        let documents = Object.values(collection.documents);

        if (filters) {
            documents = documents.filter(document => this.filterDocument(document, filters));
        }

        return Promise.resolve(documents);
    }

    public update(
        model: typeof Model,
        id: Key,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void> {
        const collection = this.collection(model.collection);
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

    public delete(model: typeof Model, id: Key): Promise<void> {
        const collection = this.collection(model.collection);
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

    private filterDocument(document: Document, filters: Filters): boolean {
        for (const field in filters) {
            if (document[field] !== filters[field]) {
                return false;
            }
        }

        return true;
    }

}
