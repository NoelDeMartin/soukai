import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import { facade, fail } from '@noeldemartin/utils';

import DocumentAlreadyExists from 'soukai/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai/errors/DocumentNotFound';
import { EngineHelper, setEngine } from 'soukai/engines';
import type {
    Engine,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from 'soukai/engines/Engine';

export interface FakeEngineCollection {
    [id: string]: EngineDocument;
}

export interface FakeEngineDatabase {
    [collection: string]: FakeEngineCollection;
}

export class FakeEngineInstance implements Engine {

    public database: FakeEngineDatabase = {};
    public readonly createSpy: MockInstance;
    public readonly readOneSpy: MockInstance;
    public readonly readManySpy: MockInstance;
    public readonly updateSpy: MockInstance;
    public readonly deleteSpy: MockInstance;

    private helper: EngineHelper;

    public constructor() {
        this.helper = new EngineHelper();
        this.createSpy = vi.spyOn(this as FakeEngineInstance, 'create');
        this.readOneSpy = vi.spyOn(this as FakeEngineInstance, 'readOne');
        this.readManySpy = vi.spyOn(this as FakeEngineInstance, 'readMany');
        this.updateSpy = vi.spyOn(this as FakeEngineInstance, 'update');
        this.deleteSpy = vi.spyOn(this as FakeEngineInstance, 'delete');
    }

    public use(): void {
        setEngine(this);
    }

    public resetSpies(): void {
        this.createSpy.mockClear();
        this.readOneSpy.mockClear();
        this.readManySpy.mockClear();
        this.updateSpy.mockClear();
        this.deleteSpy.mockClear();
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
        const document = (collection[id] as EngineDocument) ?? fail(DocumentNotFound, id, collectionName);
        const newDocument = { ...document };

        this.helper.updateAttributes(newDocument, updates);

        collection[id] = newDocument;
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
        return name in this.database;
    }

    private collection(name: string): FakeEngineCollection {
        return (this.database[name] ??= {});
    }

}

export default facade(FakeEngineInstance);
