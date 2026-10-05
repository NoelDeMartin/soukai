import { ListenersManager, PromisedValue, facade } from '@noeldemartin/utils';
import type { Listeners } from '@noeldemartin/utils';
import { deleteDB, openDB } from 'idb';
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

export interface SoukaiIndexedDBListener {
    onCleared?(): unknown;
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
    private _listeners = new ListenersManager<SoukaiIndexedDBListener>();

    public get listeners(): Listeners<SoukaiIndexedDBListener> {
        return this._listeners;
    }

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
                    blocking: (_, blockedVersion) => {
                        connection.close();

                        if (this.promisedConnection === promised) {
                            this.promisedConnection = null;
                        }

                        if (blockedVersion === null) {
                            void this._listeners.emit('onCleared');
                        }
                    },
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

        await this._listeners.emit('onCleared');
    }

    private throwDatabaseBlockedError(): void {
        throw new SoukaiError("An attempt to open Soukai's IndexedDB connection has been blocked");
    }
}

export default facade(SoukaiIndexedDB);
