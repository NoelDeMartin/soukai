import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, vi } from 'vite-plus/test';

beforeEach(() => {
    vi.useRealTimers();

    globalThis.indexedDB = new IDBFactory();
});
