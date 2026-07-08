import { facade, objectWithout, urlRoute } from '@noeldemartin/utils';

import InMemoryIDBStore from 'soukai-bis/lib/InMemoryIDBStore';
import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import { getBootedModels } from 'soukai-bis/models/registry';
import { requireSafeContainerUrl } from 'soukai-bis/utils/urls';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import type { SchemaComputedAttributeDefinition } from 'soukai-bis/models/relations/schema';

export class ComputedAttributesCache {

    private store = new InMemoryIDBStore('computedAttributes');

    public async set<T extends ModelWithUrl>(model: T, name: string, value: unknown): Promise<void> {
        const key: [string, string] = [model.static().modelName, model.url];
        const document = (await this.store.get(key)) ?? {
            url: model.url,
            model: model.static().modelName,
        };

        document[name] = value;

        await this.store.set(key, document);
    }

    public async get<TModel extends ModelWithUrl, TValue>(model: TModel, name: string): Promise<TValue | undefined> {
        const document = await this.store.get([model.static().modelName, model.url]);

        return document ? (document[name] as TValue) : undefined;
    }

    public async invalidate(options: { documentUrls: string[] }): Promise<void> {
        await this.store.traverse('readwrite', async (cursor) => {
            const entry = cursor.value;
            const { model, url: entryUrl, ...attributes } = entry;
            const modelClass = getBootedModels().get(model);
            const invalidatedAttributes: (keyof typeof entry)[] = [];

            if (!modelClass) {
                return;
            }

            const attributeKeys = Object.keys(attributes);

            for (const attribute of attributeKeys) {
                const definition = modelClass.schema.computed[attribute];

                if (!definition || !this.shouldInvalidateCache(definition, entryUrl, options.documentUrls)) {
                    continue;
                }

                invalidatedAttributes.push(attribute);
            }

            if (invalidatedAttributes.length === 0) {
                return;
            }

            invalidatedAttributes.length === attributeKeys.length
                ? await cursor.delete()
                : await cursor.update(objectWithout(entry, invalidatedAttributes) as typeof entry);
        });
    }

    public async close(): Promise<void> {
        await SoukaiIndexedDB.close();
    }

    public async clear(): Promise<void> {
        await this.store.clear();
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

}

export default facade(ComputedAttributesCache);
