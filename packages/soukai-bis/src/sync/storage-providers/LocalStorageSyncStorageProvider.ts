import { Storage, arrayFilter, isPlainObject } from '@noeldemartin/utils';
import { restoreExternalSource, serializeExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource, SerializedExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import { getNamespace } from 'soukai-bis/lib/namespace';
import type { ModelContainerUrls } from 'soukai-bis/sync/concerns/container-urls';
import type { SyncStorageProvider } from 'soukai-bis/sync/Sync';

type SyncStateKey = 'setupCompleted' | 'containerUrls' | 'externalSources';

export interface LocalStorageSyncStorageProviderOptions {
    namespace?: string;
}

export default class LocalStorageSyncStorageProvider implements SyncStorageProvider {
    public readonly namespace: string;

    constructor(options: LocalStorageSyncStorageProviderOptions = {}) {
        this.namespace = options.namespace ?? `${getNamespace()}-sync`;
    }

    public getSetupCompleted(): boolean {
        return this.get<unknown>('setupCompleted', false) === true;
    }

    public setSetupCompleted(setupCompleted: boolean): void {
        this.set('setupCompleted', setupCompleted);
    }

    public getContainerUrls(): Record<string, ModelContainerUrls> {
        const containerUrls = this.get<Record<string, ModelContainerUrls>>('containerUrls', {});

        return isPlainObject(containerUrls) ? containerUrls : {};
    }

    public setContainerUrls(containerUrls: Record<string, ModelContainerUrls>): void {
        this.set('containerUrls', containerUrls);
    }

    public getExternalSources(): ExternalSource[] {
        const externalSources = this.get<SerializedExternalSource[]>('externalSources', []);

        if (!Array.isArray(externalSources)) {
            return [];
        }

        return arrayFilter(
            externalSources.map((source) => {
                try {
                    return restoreExternalSource(source);
                } catch (error) {
                    // oxlint-disable-next-line no-console
                    console.warn(`Ignoring external source ${source?.containerUrl ?? source?.instanceUrl}`, error);

                    return null;
                }
            }),
        );
    }

    public setExternalSources(externalSources: ExternalSource[]): void {
        this.set('externalSources', externalSources.map(serializeExternalSource));
    }

    private get<T>(key: SyncStateKey, defaultValue: T): T {
        try {
            return Storage.get(this.getStorageKey(key), defaultValue);
        } catch {
            return defaultValue;
        }
    }

    private set(key: SyncStateKey, value: unknown): void {
        Storage.set(this.getStorageKey(key), value);
    }

    private getStorageKey(key: SyncStateKey): string {
        return `${this.namespace}:${key}`;
    }
}
