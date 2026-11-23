import { ListenersManager, arrayEquals, arrayFrom, facade, fail, invade, once } from '@noeldemartin/utils';
import type { ListenerPayload, Listeners } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    assertExternalSourceModelsBooted,
    getExternalSourceUrl,
    isInExternalSource,
} from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { SyncApplicationModel } from 'soukai-bis/jobs/sync/SyncJob';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import type { ModelConstructor } from 'soukai-bis/models/types';

import { getDiscoveryUrls } from './concerns/container-urls';
import type { ModelContainerUrls } from './concerns/container-urls';
import { discardExternalSource } from './concerns/external-sources';
import SyncSession from './SyncSession';
import type { SyncListener, SyncSessionConfig } from './SyncSession';

export interface SyncServiceListener extends SyncListener {
    onSessionStarted?(session: SyncSession): unknown;
    onSessionEnded?(session: SyncSession): unknown;
}

export interface SyncStorageProvider {
    getSetupCompleted(): boolean | Promise<boolean>;
    setSetupCompleted(setupCompleted: boolean): unknown;
    getContainerUrls(): Record<string, ModelContainerUrls> | Promise<Record<string, ModelContainerUrls>>;
    setContainerUrls(containerUrls: Record<string, ModelContainerUrls>): unknown;
    getExternalSources(): ExternalSource[] | Promise<ExternalSource[]>;
    setExternalSources(externalSources: ExternalSource[]): unknown;
}

export interface SyncBootConfig {
    storageProvider: SyncStorageProvider;
    models?: SyncApplicationModel[];
}

export class SyncService {
    private _session: SyncSession | null = null;
    private _listeners = new ListenersManager<SyncServiceListener>();
    private _storageProvider: SyncStorageProvider | null = null;
    private _models: SyncApplicationModel[] = [];
    private _setupCompleted = false;
    private _containerUrls: Record<string, ModelContainerUrls> = {};
    private _externalSources: ExternalSource[] = [];

    public get session(): SyncSession | null {
        return this._session;
    }

    public get listeners(): Listeners<SyncServiceListener> {
        return this._listeners;
    }

    public get booted(): boolean {
        return !!this._storageProvider;
    }

    public get models(): SyncApplicationModel[] {
        return this._models.slice(0);
    }

    public get setupCompleted(): boolean {
        return this._setupCompleted;
    }

    public get containerUrls(): Record<string, ModelContainerUrls> {
        return { ...this._containerUrls };
    }

    public get externalSources(): ExternalSource[] {
        return this._externalSources.slice(0);
    }

    public async boot(config: SyncBootConfig): Promise<void> {
        if (this.session) {
            throw new SoukaiError("Sync can't be booted while a session is running");
        }

        const setupCompleted = await config.storageProvider.getSetupCompleted();
        const containerUrls = await config.storageProvider.getContainerUrls();
        const externalSources = await config.storageProvider.getExternalSources();

        externalSources.forEach((source) => assertExternalSourceModelsBooted(source));

        this._storageProvider = config.storageProvider;
        this._models = [...(config.models ?? [])];
        this._setupCompleted = setupCompleted;
        this._containerUrls = { ...containerUrls };
        this._externalSources = [...externalSources];

        if (!setupCompleted) {
            return;
        }

        for (const { model } of this.getRegisteredModels()) {
            const modelContainerUrls = containerUrls[model.modelName];

            modelContainerUrls && (model.defaultContainerUrl = modelContainerUrls.default);
        }

        this.trackLocalChanges(this._models.map(({ model }) => model));
    }

    public getDiscoveryUrls(modelClass: ModelConstructor): string[] {
        const containerUrls = this._containerUrls[modelClass.modelName];

        return containerUrls ? getDiscoveryUrls(containerUrls) : [modelClass.defaultContainerUrl];
    }

    public trackLocalChanges(models: ModelConstructor | ModelConstructor[]): void {
        arrayFrom(models).forEach((model) => trackLocalChanges(model));
    }

    public async addExternalSource(source: ExternalSource): Promise<void> {
        this.assertBooted();

        if (this.hasExternalSource(source)) {
            return;
        }

        assertExternalSourceModelsBooted(source);

        await this.updateExternalSources([...this._externalSources, source]);
    }

    public hasExternalSource(source: ExternalSource): boolean {
        const sourceUrl = getExternalSourceUrl(source);

        return this._externalSources.some((externalSource) => getExternalSourceUrl(externalSource) === sourceUrl);
    }

    public isInExternalSource(url: string): boolean {
        return this._externalSources.some((source) => isInExternalSource(source, url));
    }

    public async removeExternalSource(source: ExternalSource): Promise<void> {
        if (!this.hasExternalSource(source)) {
            return;
        }

        this.assertBooted();

        const session = this._session;

        if (session) {
            await invade(session, ['lock']).lock(() => discardExternalSource(this, source));

            return;
        }

        await discardExternalSource(this, source);
    }

    public async connect(config: SyncSessionConfig): Promise<SyncSession> {
        if (this.session) {
            throw new SoukaiError(
                "Sync already has a running session, call its disconnect() method and wait until it's done first",
            );
        }

        this.assertBooted();

        const session = new SyncSession(config, this, this._listeners);
        const endSession = once(async () => {
            this._session === session && (this._session = null);

            await this._listeners.emit('onSessionEnded', session);
        });

        this._session = session;

        try {
            await this._listeners.emit('onSessionStarted', session);
            await invade(session, ['connect']).connect(endSession);
        } catch (error) {
            await session.disconnect();
            await endSession();

            throw error;
        }

        return session;
    }

    protected getRegisteredModels(): SyncApplicationModel[] {
        return this._models.filter((syncModel) => !!syncModel.registration);
    }

    protected async completeSetup(): Promise<void> {
        if (this._setupCompleted) {
            return;
        }

        this._setupCompleted = true;
        this.trackLocalChanges(this._models.map(({ model }) => model));

        await this.storageProvider.setSetupCompleted(true);
        await this.emit('onUpdated', { setupCompleted: true });
    }

    protected async updateContainerUrls(containerUrls: Record<string, ModelContainerUrls>): Promise<void> {
        const previousContainerUrls = this._containerUrls;

        this._containerUrls = { ...this._containerUrls, ...containerUrls };

        await this.storageProvider.setContainerUrls(this._containerUrls);

        for (const { model } of this.getRegisteredModels()) {
            const modelContainerUrls = containerUrls[model.modelName];

            if (!modelContainerUrls) {
                continue;
            }

            const previousModelContainerUrls = previousContainerUrls[model.modelName];
            const discoveryUrls = getDiscoveryUrls(modelContainerUrls);

            model.defaultContainerUrl = modelContainerUrls.default;

            if (
                previousModelContainerUrls &&
                arrayEquals(getDiscoveryUrls(previousModelContainerUrls), discoveryUrls)
            ) {
                continue;
            }

            await this.emit('onContainersUpdated', model, discoveryUrls);
        }

        await this.emit('onUpdated', { containerUrls: this._containerUrls });
    }

    protected async updateExternalSources(externalSources: ExternalSource[]): Promise<void> {
        this._externalSources = externalSources;

        await this.storageProvider.setExternalSources(this.externalSources);
        await this.emit('onUpdated', { externalSources: this.externalSources });
    }

    private assertBooted(): void {
        if (this.booted) {
            return;
        }

        throw new SoukaiError("Sync hasn't been booted, call boot() first");
    }

    private get storageProvider(): SyncStorageProvider {
        return this._storageProvider ?? fail(SoukaiError, "Sync hasn't been booted, call boot() first");
    }

    private async emit<TEvent extends keyof SyncListener>(
        event: TEvent,
        ...payload: ListenerPayload<SyncListener, TEvent>
    ): Promise<void> {
        if (this._session) {
            await invade(this._session, ['emit']).emit(event, ...payload);

            return;
        }

        await this._listeners.emit(event, ...(payload as ListenerPayload<SyncServiceListener, TEvent>));
    }
}

export default facade(SyncService);
