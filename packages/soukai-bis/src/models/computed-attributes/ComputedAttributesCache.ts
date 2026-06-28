import { facade, objectWithout, urlRoute } from '@noeldemartin/utils';
import type { IDBPCursorWithValue, IDBPDatabase } from 'idb';

import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import { getBootedModels } from 'soukai-bis/models/registry';
import { requireSafeContainerUrl } from 'soukai-bis/utils/urls';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import type { SchemaComputedAttributeDefinition } from 'soukai-bis/models/relations/schema';
import type { SoukaiIndexedDBSchema } from 'soukai-bis/lib/SoukaiIndexedDB';

export class ComputedAttributesCache {

    public async set<T extends ModelWithUrl>(model: T, name: string, value: unknown): Promise<void> {
        const connection = await this.connect();
        const transaction = connection.transaction('computedAttributes', 'readwrite');
        const store = transaction.objectStore('computedAttributes');
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
        const document = await connection.get('computedAttributes', [model.static().modelName, model.url]);

        return document ? (document[name] as TValue) : undefined;
    }

    public async invalidate(affectedDocumentUrls: string[]): Promise<void> {
        const connection = await this.connect();
        const transaction = connection.transaction('computedAttributes', 'readwrite');
        const store = transaction.objectStore('computedAttributes');

        let cursor = await store.openCursor();

        while (cursor) {
            await this.invalidateEntry(cursor, affectedDocumentUrls);

            cursor = await cursor.continue();
        }

        await transaction.done;
    }

    public async close(): Promise<void> {
        await SoukaiIndexedDB.close();
    }

    public async clear(): Promise<void> {
        const connection = await this.connect();
        const transaction = connection.transaction('computedAttributes', 'readwrite');

        await transaction.objectStore('computedAttributes').clear();
        await transaction.done;
    }

    private async invalidateEntry(
        cursor: IDBPCursorWithValue<
            SoukaiIndexedDBSchema,
            ['computedAttributes'],
            'computedAttributes',
            unknown,
            'readwrite'
        >,
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

    private async connect(): Promise<IDBPDatabase<SoukaiIndexedDBSchema>> {
        return SoukaiIndexedDB.connect();
    }

}

export default facade(ComputedAttributesCache);
