import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { SyncStorageProvider } from 'soukai-bis/sync/Sync';
import type { ModelContainerUrls } from 'soukai-bis/sync/SyncSession';

export default class FakeSyncStorageProvider implements SyncStorageProvider {
    public setupCompleted: boolean;
    public containerUrls: Record<string, ModelContainerUrls>;
    public externalSources: ExternalSource[];

    constructor(
        options: {
            setupCompleted?: boolean;
            containerUrls?: Record<string, ModelContainerUrls>;
            externalSources?: ExternalSource[];
        } = {},
    ) {
        this.setupCompleted = options.setupCompleted ?? false;
        this.containerUrls = options.containerUrls ?? {};
        this.externalSources = options.externalSources ?? [];
    }

    public getSetupCompleted(): boolean {
        return this.setupCompleted;
    }

    public setSetupCompleted(setupCompleted: boolean): void {
        this.setupCompleted = setupCompleted;
    }

    public getContainerUrls(): Record<string, ModelContainerUrls> {
        return this.containerUrls;
    }

    public setContainerUrls(containerUrls: Record<string, ModelContainerUrls>): void {
        this.containerUrls = containerUrls;
    }

    public getExternalSources(): ExternalSource[] {
        return this.externalSources;
    }

    public setExternalSources(externalSources: ExternalSource[]): void {
        this.externalSources = externalSources;
    }
}
