import Engine, { Documents, EngineAttributes, Filters } from '@/engines/Engine';
import EngineHelper from '@/engines/EngineHelper';

import DocumentNotFound from '@/errors/DocumentNotFound';

export default class LocalStorageEngine implements Engine {

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

    public async create(collection: string, attributes: EngineAttributes, id?: string): Promise<string> {
        const documents = this.readItem(collection, {});

        id = this.helper.obtainDocumentId(id);

        documents[id] = this.serializeAttributes(attributes);

        this.writeItem(collection, documents);

        return id;
    }

    public async readOne(collection: string, id: string): Promise<EngineAttributes> {
        const documents = this.readItem(collection, {});

        if (!(id in documents)) {
            throw new DocumentNotFound(id);
        }

        return this.deserializeAttributes(documents[id]);
    }

    public async readMany(collection: string, filters?: Filters): Promise<Documents> {
        const documents = this.readItem(collection, {});

        for (const id in documents) {
            documents[id] = this.deserializeAttributes(documents[id]);
        }

        return this.helper.filterDocuments(documents, filters);
    }

    public async update(
        collection: string,
        id: string,
        updatedAttributes: EngineAttributes,
        removedAttributes: string[],
    ): Promise<void> {
        const documents = this.readItem(collection, {});

        if (!(id in documents)) {
            throw new DocumentNotFound(id);
        }

        const attributes = this.deserializeAttributes(documents[id]);

        for (const attribute in updatedAttributes) {
            attributes[attribute] = updatedAttributes[attribute];
        }

        for (const attribute of removedAttributes) {
            delete attributes[attribute];
        }

        documents[id] = this.serializeAttributes(attributes);

        this.writeItem(collection, documents);
    }

    public async delete(collection: string, id: string): Promise<void> {
        const documents = this.readItem(collection, {});

        if (!(id in documents)) {
            throw new DocumentNotFound(id);
        }

        delete documents[id];

        this.writeItem(collection, documents);
    }

    private readItem(key: string, defaultValue: any = null): any {
        const rawValue = localStorage.getItem(this.prefix + key);

        return rawValue !== null ? JSON.parse(rawValue) : defaultValue;
    }

    private writeItem(key: string, value: any): void {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }

    private serializeAttributes(attributes: EngineAttributes): EngineAttributes {
        for (const attribute in attributes) {
            const value = attributes[attribute];

            attributes[attribute] = this.serializeAttributeValue(value);
        }

        return attributes;
    }

    private serializeAttributeValue(value: any): any {
        if (Array.isArray(value)) {
            return value.map(arrayValue => this.serializeAttributeValue(arrayValue));
        } else if (value instanceof Date) {
            return { __dateTime: value.getTime() };
        } else if (typeof value === 'object') {
            return this.serializeAttributes(value as EngineAttributes);
        } else {
            return value;
        }
    }

    private deserializeAttributes(attributes: EngineAttributes): EngineAttributes {
        for (const attribute in attributes) {
            const value = attributes[attribute];

            attributes[attribute] = this.deserializeAttributeValue(value);
        }

        return attributes;
    }

    private deserializeAttributeValue(value: any, depth: number = 0): any {
        if (Array.isArray(value)) {
            return value.map(arrayValue => this.deserializeAttributes(arrayValue));
        } else if (typeof value === 'object' && '__dateTime' in value) {
            return new Date(value.__dateTime);
        } else {
            return value;
        }
    }

}
