import { fail } from '@noeldemartin/utils';

import { EngineHelper } from '@/engines/EngineHelper';
import type {
    Engine,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from '@/engines/Engine';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';

export interface InMemoryEngineCollection {
    [id: string]: EngineDocument;
}

export interface InMemoryEngineDatabase {
    [collection: string]: InMemoryEngineCollection;
}

/**
 * Engine that stores data in memory. Data can be accessed with the [[database]] property to
 * get an [[InMemoryEngineDatabase]].
 */
export class InMemoryEngine implements Engine {

    private db: InMemoryEngineDatabase = {};

    private helper: EngineHelper;

    public constructor() {
        this.helper = new EngineHelper();
    }

    public get database(): InMemoryEngineDatabase {
        return this.db;
    }

    public create(collectionName: string, document: EngineDocument, id?: string): Promise<string> {
        const collection = this.collection(collectionName);

        id = this.helper.obtainDocumentId(id);

        if (id in collection) {
            throw new DocumentAlreadyExists(id);
        }

        collection[id] = document;

        return Promise.resolve(id);
    }

    public async readOne(collectionName: string, id: string): Promise<EngineDocument> {
        const collection = this.collection(collectionName);

        return collection[id] ?? fail(DocumentNotFound, id, collection);
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        if (!this.hasCollection(collection)) {
            return {};
        }

        const documents = this.collection(collection);

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(collectionName: string, id: string, updates: EngineUpdates): Promise<void> {
        const collection = this.collection(collectionName);
        const document = collection[id] as EngineDocument ?? fail(DocumentNotFound, id, 3, collectionName);

        this.helper.updateAttributes(document, updates);
    }

    public delete(collectionName: string, id: string): Promise<void> {
        const collection = this.collection(collectionName);
        if (id in collection) {
            delete collection[id];
            return Promise.resolve();
        } else {
            return Promise.reject(new DocumentNotFound(id, collectionName));
        }
    }

    private hasCollection(name: string): boolean {
        return name in this.db;
    }

    private collection(name: string): InMemoryEngineCollection {
        return this.db[name] ??= {};
    }

}
