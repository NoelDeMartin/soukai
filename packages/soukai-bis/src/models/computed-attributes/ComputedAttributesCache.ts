import { deleteDB, openDB } from 'idb';
import { facade, objectWithout, urlRoute } from '@noeldemartin/utils';
import type { DBSchema, IDBPCursorWithValue, IDBPDatabase } from 'idb';

import { getNamespace } from 'soukai-bis/lib/namespace';
import { getBootedModels } from 'soukai-bis/models/registry';
import { requireSafeContainerUrl } from 'soukai-bis/utils/urls';
import { SoukaiError } from 'soukai-bis/errors';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import type { SchemaComputedAttributeDefinition } from 'soukai-bis/models/relations/schema';

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

    public async invalidate(affectedDocumentUrls: string[]): Promise<void> {
        const connection = await this.connect();
        const transaction = connection.transaction('attributes', 'readwrite');
        const store = transaction.objectStore('attributes');

        let cursor = await store.openCursor();

        while (cursor) {
            await this.invalidateEntry(cursor, affectedDocumentUrls);

            cursor = await cursor.continue();
        }

        await transaction.done;
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

    private async invalidateEntry(
        cursor: IDBPCursorWithValue<ComputedAttributesSchema, ['attributes'], 'attributes', unknown, 'readwrite'>,
        affectedDocumentUrls: string[],
    ) {
        const entry = cursor.value;
        const { model, url: entryUrl, ...attributes } = entry;
        const modelClass = getBootedModels().get(model);
        const invalidatedAttributes: (keyof typeof entry)[] = [];

        if (!modelClass) {
            return;
        }

        for (const attribute of Object.keys(attributes)) {
            const definition = modelClass.schema.computed[attribute];

            if (!definition || !this.shouldInvalidateCache(definition, entryUrl, affectedDocumentUrls)) {
                continue;
            }

            invalidatedAttributes.push(attribute);
        }

        if (invalidatedAttributes.length === 0) {
            return;
        }

        invalidatedAttributes.length === attributes.length
            ? await cursor.delete()
            : await cursor.update(objectWithout(entry, invalidatedAttributes) as typeof entry);
    }

    private shouldInvalidateCache(
        definition: SchemaComputedAttributeDefinition,
        entryUrl: string,
        affectedDocumentUrls: string[],
    ): boolean {
        switch (definition.invalidationStrategy) {
            case 'document':
                return affectedDocumentUrls.includes(urlRoute(entryUrl));
            case 'container': {
                const containerUrl = requireSafeContainerUrl(entryUrl);

                return affectedDocumentUrls.some((url) => url.startsWith(containerUrl));
            }
        }
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
