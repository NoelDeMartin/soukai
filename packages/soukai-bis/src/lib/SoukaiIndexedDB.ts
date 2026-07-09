import { deleteDB, openDB } from 'idb';
import { PromisedValue, arrayRemove, facade } from '@noeldemartin/utils';
import type { DBSchema, IDBPDatabase } from 'idb';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getNamespace } from 'soukai-bis/lib/namespace';
import type { IDBGraph } from 'soukai-bis/utils/idb-quads';

export interface LocalDocument {
    url: string;
    containerUrl: string;
    resources: IDBGraph;
    lastModifiedAt?: Date | null;
}

export interface SoukaiIndexedDBSchema extends DBSchema {
    documents: {
        key: string;
        value: LocalDocument;
        indexes: {
            containerUrl: string;
            lastModifiedAt: Date;
        };
    };
    containers: {
        key: string;
        value: {
            url: string;
            dropped?: boolean;
        };
    };
    computedAttributes: {
        key: [string, string];
        value: {
            model: string;
            url: string;
            [attribute: string]: unknown;
        };
    };
}

export class SoukaiIndexedDB {

    private promisedConnection: PromisedValue<IDBPDatabase<SoukaiIndexedDBSchema>> | null = null;
    private clearListeners: (() => void)[] = [];

    public async connect(): Promise<IDBPDatabase<SoukaiIndexedDBSchema>> {
        if (!this.promisedConnection) {
            const promised = (this.promisedConnection = new PromisedValue());

            try {
                const connection = await openDB<SoukaiIndexedDBSchema>(getNamespace(), 1, {
                    upgrade(database) {
                        const documentsStore = database.createObjectStore('documents', { keyPath: 'url' });

                        database.createObjectStore('containers', { keyPath: 'url' });
                        database.createObjectStore('computedAttributes', { keyPath: ['model', 'url'] });

                        documentsStore.createIndex('containerUrl', 'containerUrl', { unique: false });
                        documentsStore.createIndex('lastModifiedAt', 'lastModifiedAt', { unique: false });
                    },
                    blocked: () => this.throwDatabaseBlockedError(),
                });

                promised.resolve(connection);
            } catch (error) {
                promised.reject(error instanceof Error ? error : new Error(String(error)));

                if (this.promisedConnection === promised) {
                    this.promisedConnection = null;
                }
            }

            return promised;
        }

        return this.promisedConnection;
    }

    public async close(): Promise<void> {
        if (!this.promisedConnection) {
            return;
        }

        try {
            const connection = await this.promisedConnection;

            connection.close();
        } finally {
            this.promisedConnection = null;
        }
    }

    public async clear(): Promise<void> {
        await this.close();
        await deleteDB(getNamespace(), {
            blocked: () => this.throwDatabaseBlockedError(),
        });

        this.clearListeners.forEach((listener) => listener());
    }

    public addClearListener(listener: () => void): () => void {
        this.clearListeners.push(listener);

        return () => arrayRemove(this.clearListeners, listener);
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError('An attempt to open Soukai\'s IndexedDB connection has been blocked');
    }

}

export default facade(SoukaiIndexedDB);
