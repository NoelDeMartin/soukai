import { deleteDB, openDB } from 'idb';
import { facade } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase } from 'idb';

import { getNamespace } from 'soukai-bis/lib/namespace';
import { SoukaiError } from 'soukai-bis/errors';
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

    private databaseConnection?: Promise<IDBPDatabase<ComputedAttributesSchema>>;

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

    public async close(): Promise<void> {
        if (!this.databaseConnection) {
            return;
        }

        const connection = await this.databaseConnection;

        connection.close();

        delete this.databaseConnection;
    }

    public async clear(): Promise<void> {
        await this.close();
        await deleteDB(`${getNamespace()}:computed`, { blocked: () => this.throwDatabaseBlockedError() });
    }

    private async connect(): Promise<IDBPDatabase<ComputedAttributesSchema>> {
        const databaseName = `${getNamespace()}:computed`;
        const connection = await (this.databaseConnection ??= openDB<ComputedAttributesSchema>(databaseName, 1, {
            upgrade(database) {
                database.createObjectStore('attributes', { keyPath: ['model', 'url'] });
            },
        }));

        return connection;
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError(
            'An attempt to open an IndexedDB connection has been blocked, ' +
                'remember to call ComputedAttributesCache.close() when necessary. ',
        );
    }

}

export default facade(ComputedAttributesCache);
