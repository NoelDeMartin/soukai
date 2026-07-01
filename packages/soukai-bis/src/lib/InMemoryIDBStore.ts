import { PromisedValue } from '@noeldemartin/utils';
import type { IDBPCursorWithValue, IndexKey, StoreKey, StoreNames, StoreValue } from 'idb';

import SoukaiIndexedDB from './SoukaiIndexedDB';
import type { SoukaiIndexedDBSchema } from './SoukaiIndexedDB';

export type InMemoryIDBStoreCursor<
    TStoreName extends keyof SoukaiIndexedDBSchema & StoreNames<SoukaiIndexedDBSchema>,
    TMode extends IDBTransactionMode,
> = IDBPCursorWithValue<
    SoukaiIndexedDBSchema,
    [TStoreName],
    TStoreName,
    SoukaiIndexedDBSchema[TStoreName]['value'],
    TMode
>;

export default class InMemoryIDBStore<
    TStoreName extends keyof SoukaiIndexedDBSchema & StoreNames<SoukaiIndexedDBSchema>,
> {

    private cache: PromisedValue<Map<string, SoukaiIndexedDBSchema[TStoreName]['value']>> | null = null;
    private clearListener: (() => void) | null = null;

    constructor(private storeName: TStoreName) {}

    public async get(
        key: SoukaiIndexedDBSchema[TStoreName]['key'],
    ): Promise<SoukaiIndexedDBSchema[TStoreName]['value'] | undefined> {
        const cache = await this.getCache();

        return cache.get(this.inMemoryKey(key));
    }

    public async set(
        key: SoukaiIndexedDBSchema[TStoreName]['key'],
        value: SoukaiIndexedDBSchema[TStoreName]['value'],
    ): Promise<void> {
        try {
            const connection = await SoukaiIndexedDB.connect();
            const transaction = connection.transaction(this.storeName, 'readwrite');

            await transaction.objectStore(this.storeName).put(value);
            await transaction.done;

            const cache = await this.getCache();
            cache.set(this.inMemoryKey(key), value);
        } catch (error) {
            this.cache = null;

            throw error;
        }
    }

    public async clear(): Promise<void> {
        this.cache = null;
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        await store.clear();
        await transaction.done;
    }

    public async traverse<T extends IDBTransactionMode>(
        mode: T,
        callback: (cursor: InMemoryIDBStoreCursor<TStoreName, T>) => Promise<void>,
    ): Promise<void> {
        const cache = await this.getCache();
        const connection = await SoukaiIndexedDB.connect();
        const transaction = connection.transaction(this.storeName, mode);
        const store = transaction.objectStore(this.storeName);

        try {
            let cursor = await store.openCursor();

            while (cursor) {
                await callback(this.wrapCursor<T>(cursor, cache));

                cursor = await cursor.continue();
            }

            await transaction.done;
        } catch (error) {
            this.cache = null;

            throw error;
        }
    }

    private getCache(): PromisedValue<Map<string, SoukaiIndexedDBSchema[TStoreName]['value']>> {
        if (!this.clearListener) {
            this.clearListener = () => (this.cache = null);

            SoukaiIndexedDB.addClearListener(this.clearListener);
        }

        if (!this.cache) {
            this.cache = new PromisedValue();

            this.initializeCache(this.cache);
        }

        return this.cache;
    }

    private async initializeCache(
        promised: PromisedValue<Map<string, SoukaiIndexedDBSchema[TStoreName]['value']>>,
    ): Promise<void> {
        try {
            const cacheMap = new Map<string, SoukaiIndexedDBSchema[TStoreName]['value']>();
            const connection = await SoukaiIndexedDB.connect();
            const transaction = connection.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);

            let cursor = await store.openCursor();

            while (cursor) {
                cacheMap.set(this.inMemoryKey(cursor.key), cursor.value);

                cursor = await cursor.continue();
            }

            promised.resolve(cacheMap);
        } catch (error) {
            this.cache = null;

            promised.reject(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private wrapCursor<T extends IDBTransactionMode>(
        cursor: unknown,
        cache: Map<string, SoukaiIndexedDBSchema[TStoreName]['value']>,
    ): InMemoryIDBStoreCursor<TStoreName, T> {
        const _cursor = cursor as unknown as IDBPCursorWithValue<
            SoukaiIndexedDBSchema,
            [TStoreName],
            TStoreName,
            SoukaiIndexedDBSchema[TStoreName]['value'],
            'readwrite'
        >;

        return {
            get key() {
                return _cursor.key;
            },
            get value() {
                return _cursor.value;
            },
            async continue() {
                throw new Error('Not implemented');
            },
            update: async (newValue: StoreValue<SoukaiIndexedDBSchema, TStoreName>) => {
                await _cursor.update(newValue);

                cache.set(this.inMemoryKey(_cursor.key), newValue);
            },
            delete: async () => {
                await _cursor.delete();

                cache.delete(this.inMemoryKey(_cursor.key));
            },
        } as unknown as InMemoryIDBStoreCursor<TStoreName, T>;
    }

    private inMemoryKey(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        key: IndexKey<SoukaiIndexedDBSchema, TStoreName, any> | StoreKey<SoukaiIndexedDBSchema, TStoreName>,
    ): string {
        if (Array.isArray(key)) {
            return key.join(':');
        }

        return String(key);
    }

}
