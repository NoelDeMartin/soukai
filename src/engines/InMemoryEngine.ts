import Engine, { Attributes, Documents, Filters } from '@/engines/Engine';
import EngineHelper from '@/engines/EngineHelper';

import DocumentNotFound from '@/errors/DocumentNotFound';

interface Collection {
    [id: string]: Attributes;
}

export interface InMemoryDatabase {
    [collection: string]: Collection;
}

export default class implements Engine {

    private db: InMemoryDatabase = {};

    private helper: EngineHelper;

    public constructor() {
        this.helper = new EngineHelper();
    }

    public get database(): InMemoryDatabase {
        return this.db;
    }

    public create(collectionName: string, attributes: Attributes, id?: string): Promise<string> {
        const collection = this.collection(collectionName);

        id = this.helper.getDocumentId(id);
        collection[id] = attributes;

        return Promise.resolve(id);
    }

    public readOne(collectionName: string, id: string): Promise<Attributes> {
        const collection = this.collection(collectionName);
        if (id in collection) {
            return Promise.resolve(collection[id]);
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public async readMany(collection: string, filters?: Filters): Promise<Documents> {
        if (!this.hasCollection(collection)) {
            return {};
        }

        const documents = this.collection(collection);

        return this.helper.filterDocuments(documents, filters);
    }

    public update(
        collectionName: string,
        id: string,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection) {
            const document = collection[id];
            collection[id] = { ...document, ...dirtyAttributes };
            for (const attribute of removedAttributes) {
                delete collection[id][attribute];
            }
            return Promise.resolve();
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    public delete(collectionName: string, id: string): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection) {
            delete collection[id];
            return Promise.resolve();
        } else {
            return Promise.reject(new DocumentNotFound(id));
        }
    }

    private hasCollection(name: string): boolean {
        return name in this.db;
    }

    private collection(name: string): Collection {
        if (!this.hasCollection(name)) {
            this.db[name] = {};
        }

        return this.db[name];
    }

}
