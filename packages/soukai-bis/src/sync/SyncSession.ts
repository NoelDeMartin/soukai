import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { Semaphore, coalesce, debounce, fail } from '@noeldemartin/utils';
import type { ListenerPayload, ListenersManager } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    assertExternalSourceModelsBooted,
    getExternalSourceUrl,
    isInExternalSource,
} from 'soukai-bis/jobs/sync/external-sources';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type {
    DeletionConflict,
    DeletionConflictResolution,
    FileConflict,
    FileConflictResolution,
    FilePushedEvent,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
    SyncApplicationModel,
} from 'soukai-bis/jobs/sync/SyncJob';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import type { ModelConstructor } from 'soukai-bis/models/types';

import {
    getDefaultRemoteContainerUrl,
    initializeContainerUrls,
    trackUnlistedContainerUrls,
} from './concerns/container-urls';
import type { ModelContainerUrls } from './concerns/container-urls';
import { discardExternalSource } from './concerns/external-sources';
import { updateLocalChanges } from './concerns/local-changes';
import { isSetupCompleted, runSetup } from './concerns/setup';
import { runSync } from './concerns/sync';
import type { SyncTypeIndexes } from './concerns/sync';

export type { ModelContainerUrls } from './concerns/container-urls';
export type { SyncTypeIndexes } from './concerns/sync';

export interface SyncProperties {
    connected: boolean;
    online: boolean;
    syncing: boolean;
    localChangesCount: number;
    error: unknown;
    setupCompleted: boolean;
    containerUrls: Record<string, ModelContainerUrls>;
    externalSources: ExternalSource[];
    activeJob: SyncJob | null;
}

export interface SyncCompletedEvent {
    cancelled: boolean;
    error: unknown;
}

export interface SyncListener {
    onUpdated?(changes: Partial<SyncProperties>): unknown;
    onContainersUpdated?(modelClass: ModelConstructor, containerUrls: string[]): unknown;
    onFileUpdated?(url: string): unknown;
    onSyncStarted?(): unknown;
    onSyncCompleted?(event: SyncCompletedEvent): unknown;
    onSyncFailed?(error: unknown): unknown;
    onModelsRegistered?(event: ModelsRegisteredEvent): unknown;
    onModelsRegistrationFailed?(event: ModelsRegistrationFailedEvent): unknown;
    onExternalSourceFailed?(source: ExternalSource, error: unknown): unknown;
    onFilePushed?(event: FilePushedEvent): unknown;
}

export interface UserProfileManager {
    getProfile(): CompleteSolidUserProfile;
    findTypeIndexes?(): Promise<SyncTypeIndexes>;
    createPublicTypeIndex?(): Promise<TypeIndex>;
    createPrivateTypeIndex?(): Promise<TypeIndex>;
}

export interface SyncSessionConfig extends SyncListener {
    profileManager: UserProfileManager;
    online: boolean;
    autoPush?: boolean;
    models?: SyncApplicationModel[];
    containerUrls?: Record<string, ModelContainerUrls>;
    externalSources?: ExternalSource[];
    resolveDeletionConflict?(conflict: DeletionConflict): Promise<DeletionConflictResolution>;
    resolveFileConflict?(conflict: FileConflict): Promise<FileConflictResolution>;
}

export default class SyncSession {
    public readonly refreshLocalChanges = coalesce(() => updateLocalChanges(this));
    protected readonly config: SyncSessionConfig;
    protected readonly models: SyncApplicationModel[];
    protected autoPush: boolean;
    protected previousSyncPendingChangesets: LocalChangeset[] = [];
    protected listeners: ListenersManager<SyncListener> | null;
    private _connected = false;
    private _disconnecting = false;
    private _online: boolean;
    private _syncing = false;
    private _localChangesCount = 0;
    private _error: unknown = null;
    private _setupCompleted = false;
    private _containerUrls: Record<string, ModelContainerUrls>;
    private _externalSources: ExternalSource[];
    private _activeJob: SyncJob | null = null;
    private asyncLock = new Semaphore();
    private disconnection: Promise<void> | null = null;
    private onDisconnected: (() => unknown) | null = null;
    private unsubscribers: (() => void)[] = [];
    private pushLocalChanges = debounce(() => this.synchronize(), 1000);

    constructor(config: SyncSessionConfig, listeners: ListenersManager<SyncListener> | null = null) {
        this.config = config;
        this.models = [...(config.models ?? [])];
        this.autoPush = config.autoPush ?? true;
        this.listeners = listeners;
        this._online = config.online;
        this._containerUrls = { ...config.containerUrls };
        this._externalSources = [...(config.externalSources ?? [])];
    }

    public get connected(): boolean {
        return this._connected;
    }

    public get disconnecting(): boolean {
        return this._disconnecting;
    }

    public get online(): boolean {
        return this._online;
    }

    public get syncing(): boolean {
        return this._syncing;
    }

    public get localChangesCount(): number {
        return this._localChangesCount;
    }

    public get error(): unknown {
        return this._error;
    }

    public get setupCompleted(): boolean {
        return this._setupCompleted;
    }

    public get containerUrls(): Record<string, ModelContainerUrls> {
        return this._containerUrls;
    }

    public get externalSources(): ExternalSource[] {
        return this._externalSources.slice(0);
    }

    public get activeJob(): SyncJob | null {
        return this._activeJob;
    }

    public isActive(): boolean {
        return this._connected && !this._disconnecting;
    }

    public disconnect(): Promise<void> {
        if (this.disconnection) {
            return this.disconnection;
        }

        this._disconnecting = true;
        this.pushLocalChanges.cancel();
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];

        void this._activeJob?.cancel();

        return (this.disconnection = this.finishDisconnecting());
    }

    public setAutoPush(autoPush: boolean): void {
        if (!this.isActive()) {
            return;
        }

        this.autoPush = autoPush;

        if (!autoPush) {
            this.pushLocalChanges.cancel();
        }
    }

    public setOnline(online: boolean): void {
        if (!this.isActive()) {
            return;
        }

        this._online = online;

        void this.emit('onUpdated', { online });
    }

    public async setup(): Promise<void> {
        await this.asyncLock.run(async () => {
            if (!this.isActive()) {
                return;
            }

            await runSetup(this);
        });
    }

    public async synchronize(): Promise<void> {
        if (!this.canSynchronize()) {
            return;
        }

        await this.asyncLock.run(async () => {
            if (!this.canSynchronize()) {
                return;
            }

            await runSync(this);
        });
    }

    public addExternalSource(source: ExternalSource): void {
        if (!this.isActive() || this.hasExternalSource(source)) {
            return;
        }

        assertExternalSourceModelsBooted(source);

        this._externalSources = [...this._externalSources, source];

        void this.emit('onUpdated', { externalSources: this.externalSources });
    }

    public hasExternalSource(source: ExternalSource): boolean {
        const sourceUrl = getExternalSourceUrl(source);

        return this._externalSources.some((externalSource) => getExternalSourceUrl(externalSource) === sourceUrl);
    }

    public isInExternalSource(url: string): boolean {
        return this._externalSources.some((source) => isInExternalSource(source, url));
    }

    public async removeExternalSource(source: ExternalSource): Promise<void> {
        await this.asyncLock.run(async () => {
            if (!this.isActive()) {
                return;
            }

            await discardExternalSource(this, source);
        });
    }

    public requireRemoteContainerUrl(modelClass: ModelConstructor): string {
        const syncModel =
            this.getRegisteredModels().find(({ model }) => model === modelClass) ??
            fail<never>(SoukaiError, `Failed resolving remote container for '${modelClass.modelName}' model`);

        return this.containerUrls[modelClass.modelName]?.default ?? getDefaultRemoteContainerUrl(this, syncModel);
    }

    protected async connect(onDisconnected: () => unknown): Promise<void> {
        this.onDisconnected = onDisconnected;

        await this.asyncLock.run(async () => {
            if (this.disconnecting) {
                return;
            }

            const setupCompleted = await isSetupCompleted();

            if (this.disconnecting) {
                return;
            }

            this._connected = true;
            this._setupCompleted = setupCompleted;
            setupCompleted && this.trackLocalChanges();
            this.listen();

            await this.emit('onUpdated', {
                connected: true,
                online: this._online,
                syncing: false,
                localChangesCount: 0,
                error: null,
                setupCompleted: this.setupCompleted,
                containerUrls: this.containerUrls,
                externalSources: this.externalSources,
                activeJob: null,
            });

            for (const syncModel of this.getRegisteredModels()) {
                await initializeContainerUrls(this, syncModel);
            }
        });

        await this.refreshLocalChanges();
    }

    protected trackLocalChanges(): void {
        this.models.forEach(({ model }) => trackLocalChanges(model));
    }

    protected get profileManager(): UserProfileManager {
        return this.config.profileManager;
    }

    protected getRegisteredModels(): SyncApplicationModel[] {
        return this.models.filter((syncModel) => !!syncModel.registration);
    }

    protected canSynchronize(): boolean {
        return this.isActive() && this.setupCompleted && this.online && !this.syncing;
    }

    protected async emit<TEvent extends keyof SyncListener>(
        event: TEvent,
        ...payload: ListenerPayload<SyncListener, TEvent>
    ): Promise<void> {
        const config = this.config;

        await this.listeners?.emit(event, ...payload);
        await (config[event] as ((...args: typeof payload) => unknown) | undefined)?.call(config, ...payload);
    }

    private async finishDisconnecting(): Promise<void> {
        let wasConnected = false;

        try {
            await this.asyncLock.run(async () => {
                // Wait for running operations to finish.
            });
            await this.refreshLocalChanges();
        } finally {
            wasConnected = this._connected;

            this._connected = false;
            this._disconnecting = false;
            this._online = false;
            this._syncing = false;
            this._localChangesCount = 0;
            this._error = null;
            this._activeJob = null;

            await this.onDisconnected?.();
        }

        if (!wasConnected) {
            return;
        }

        await this.emit('onUpdated', {
            connected: false,
            online: false,
            syncing: false,
            localChangesCount: 0,
            error: null,
            activeJob: null,
        });
    }

    private listen(): void {
        this.unsubscribers.push(
            requireLocalEngine().listeners.add({ onLocalChangesUpdated: () => this.refreshLocalChanges() }),
        );

        for (const { model } of this.getRegisteredModels()) {
            this.unsubscribers.push(
                model.on(
                    'created',
                    ({ model: instance }) => this.setupCompleted && trackUnlistedContainerUrls(this, instance),
                ),
            );
        }
    }
}
