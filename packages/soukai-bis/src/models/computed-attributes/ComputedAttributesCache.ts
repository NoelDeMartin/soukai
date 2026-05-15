import { openDB } from 'idb';
import { facade } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase } from 'idb';

import type { ModelWithUrl } from 'soukai-bis/models/types';

interface ComputedAttributesSchema extends DBSchema {
    attributes: {
        key: [string, string];
        value: {
            model: string;
            url: string;
            [attribute: string]: unknown;
        };
    };
}

export class ComputedAttributesCache {

    private databaseName = 'soukai-computed-attributes';
    private databaseConnection?: Promise<IDBPDatabase<ComputedAttributesSchema>>;

    public setDatabaseName(databaseName: string): void {
        this.databaseName = databaseName;
    }

    public async set<T extends ModelWithUrl>(model: T, name: string, value: unknown): Promise<void> {
        const connection = await this.connect();
        const transaction = connection.transaction('attributes', 'readwrite');
        const store = transaction.objectStore('attributes');
        const document = (await store.get([model.static().modelName, model.url])) ?? {
            url: model.url,
            model: model.static().modelName,
        };

        document[name] = value;

        await store.put(document);
        await transaction.done;
    }

    public async get<TModel extends ModelWithUrl, TValue>(model: TModel, name: string): Promise<TValue | undefined> {
        const connection = await this.connect();
        const document = await connection.get('attributes', [model.static().modelName, model.url]);

        return document ? (document[name] as TValue) : undefined;
    }

    public async closeConnections(): Promise<void> {
        if (!this.databaseConnection) {
            return;
        }

        const connection = await this.databaseConnection;

        connection.close();

        delete this.databaseConnection;
    }

    private async connect(): Promise<IDBPDatabase<ComputedAttributesSchema>> {
        const connection = await (this.databaseConnection ??= openDB<ComputedAttributesSchema>(this.databaseName, 1, {
            upgrade(database) {
                database.createObjectStore('attributes', { keyPath: ['model', 'url'] });
            },
        }));

        return connection;
    }

}

export default facade(ComputedAttributesCache);
