import { isObject } from '@noeldemartin/utils';

import {
    Engine,
    EngineAttributeValue,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from '@/engines/Engine';
import { EngineHelper } from '@/engines/EngineHelper';

import DocumentAlreadyExists from '@/errors/DocumentAlreadyExists';
import DocumentNotFound from '@/errors/DocumentNotFound';

export class LocalStorageEngine implements Engine {

    private prefix: string;

    private helper: EngineHelper;

    public constructor(prefix: string = '') {
        this.prefix = prefix;
        this.helper = new EngineHelper();
    }

    public clear(): void {
        const keys = Object.keys(localStorage);

        for (const key of keys) {
            if (key.startsWith(this.prefix)) {
                localStorage.removeItem(key);
            }
        }
    }

    public async create(collection: string, document: EngineDocument, id?: string): Promise<string> {
        const documents = this.readItem(collection, {} as EngineDocumentsCollection);

        id = this.helper.obtainDocumentId(id);

        if (id in documents) {
            throw new DocumentAlreadyExists(id);
        }

        documents[id] = this.serializeAttributes(document);

        this.writeItem(collection, documents);

        return id;
    }

    public async readOne(collection: string, id: string): Promise<EngineDocument> {
        const documents = this.readItem(collection, {} as EngineDocumentsCollection);

        if (!(id in documents)) {
            throw new DocumentNotFound(id);
        }

        return this.deserializeAttributes(documents[id]);
    }

    public async readMany(collection: string, filters?: EngineFilters): Promise<EngineDocumentsCollection> {
        const documents = this.readItem(collection, {} as EngineDocumentsCollection);

        for (const id in documents) {
            documents[id] = this.deserializeAttributes(documents[id]);
        }

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(collection: string, id: string, updates: EngineUpdates): Promise<void> {
        const documentsCollection = this.readItem(collection, {} as EngineDocumentsCollection);

        if (!(id in documentsCollection)) {
            throw new DocumentNotFound(id);
        }

        const document = this.deserializeAttributes(documentsCollection[id]);

        this.helper.updateAttributes(document, updates);

        documentsCollection[id] = this.serializeAttributes(document);

        this.writeItem(collection, documentsCollection);
    }

    public async delete(collection: string, id: string): Promise<void> {
        const documents = this.readItem(collection, {} as EngineDocumentsCollection);

        if (!(id in documents)) {
            throw new DocumentNotFound(id);
        }

        delete documents[id];

        this.writeItem(collection, documents);
    }

    private readItem<T>(key: string): T | null;
    private readItem<T>(key: string, defaultValue: T): T;
    private readItem<T>(key: string, defaultValue: T | null = null): T | null {
        const rawValue = localStorage.getItem(this.prefix + key);

        return rawValue !== null ? JSON.parse(rawValue) : defaultValue;
    }

    private writeItem(key: string, value: unknown): void {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }

    private serializeAttributes(attributes: EngineDocument): EngineDocument {
        for (const attribute in attributes) {
            const value = attributes[attribute];

            attributes[attribute] = this.serializeAttributeValue(value);
        }

        return attributes;
    }

    private serializeAttributeValue(value: unknown): EngineAttributeValue {
        if (Array.isArray(value))
            return value.map(arrayValue => this.serializeAttributeValue(arrayValue));

        if (value instanceof Date)
            return { __dateTime: value.getTime() };

        if (typeof value === 'object')
            return this.serializeAttributes(value as EngineDocument);

        return value as EngineAttributeValue;
    }

    private deserializeAttributes(attributes: EngineDocument): EngineDocument {
        for (const attribute in attributes) {
            const value = attributes[attribute];

            attributes[attribute] = this.deserializeAttributeValue(value);
        }

        return attributes;
    }

    private deserializeAttributeValue(value: unknown): EngineAttributeValue {
        if (Array.isArray(value))
            return value.map(arrayValue => this.deserializeAttributeValue(arrayValue));

        if (isObject(value) && '__dateTime' in value)
            return new Date(value.__dateTime as number);

        return value as EngineAttributeValue;
    }

}
