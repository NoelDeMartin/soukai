import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { Semaphore, coalesce, debounce, fail, invade } from '@noeldemartin/utils';
import type { ListenerPayload, ListenersManager } from '@noeldemartin/utils';
import type { LocalChangeset } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type { ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type SyncJob from 'soukai-bis/jobs/sync/SyncJob';
import type {
    FilePushedEvent,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
    SyncApplicationModel,
    SyncConflict,
    SyncConflictResolution,
} from 'soukai-bis/jobs/sync/SyncJob';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { ModelConstructor } from 'soukai-bis/models/types';

import {
    getDefaultRemoteContainerUrl,
    initializeContainerUrls,
    trackUnlistedContainerUrls,
} from './concerns/container-urls';
import type { ModelContainerUrls } from './concerns/container-urls';
import { updateLocalChanges } from './concerns/local-changes';
import { getDefaultOnlineStatus } from './concerns/online';
import { autoSetup, runSetup } from './concerns/setup';
import type { SetupOptions } from './concerns/setup';
import { runSync } from './concerns/sync';
import type { SyncTypeIndexes } from './concerns/sync';
import type { SyncService } from './Sync';
import SyncProfileManager from './SyncProfileManager';

export type { ModelContainerUrls } from './concerns/container-urls';
export type { SetupOptions } from './concerns/setup';
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
    onContainersUpdated?(modelClass: ModelConstructor, discoveryUrls: string[]): unknown;
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
    onProfileUpdated?(profile: CompleteSolidUserProfile): unknown;
}

export interface SyncDisconnectOptions {
    reset?: boolean;
}

export interface SyncSessionBaseConfig extends SyncListener {
    online?: boolean;
    autoPush?: boolean;
    resolveConflict?(conflict: SyncConflict): Promise<SyncConflictResolution>;
}

export type SyncSessionConfig = SyncSessionBaseConfig &
    ({ user: CompleteSolidUserProfile; profileManager?: never } | { profileManager: UserProfileManager; user?: never });

export default class SyncSession {
    public readonly refreshLocalChanges = coalesce(() => updateLocalChanges(this));
    protected config: SyncSessionConfig;
    protected profileManager: UserProfileManager;
    protected service: SyncService;
    protected autoPush: boolean;
    protected previousSyncPendingChangesets: LocalChangeset[] = [];
    protected listeners: ListenersManager<SyncListener> | null;
    private _connected = false;
    private _disconnecting = false;
    private _online: boolean;
    private _syncing = false;
    private _localChangesCount = 0;
    private _error: unknown = null;
    private _activeJob: SyncJob | null = null;
    private asyncLock = new Semaphore();
    private disconnection: Promise<void> | null = null;
    private resetOnDisconnect = false;
    private onDisconnected: (() => unknown) | null = null;
    private unsubscribers: (() => void)[] = [];
    private pushLocalChanges = debounce(() => this.synchronize(), 1000);

    constructor(
        config: SyncSessionConfig,
        service: SyncService,
        listeners: ListenersManager<SyncListener> | null = null,
    ) {
        this.config = config;
        this.profileManager = config.profileManager ?? new SyncProfileManager(config.user);
        this.service = service;
        this.autoPush = config.autoPush ?? true;
        this.listeners = listeners;
        this._online = config.online ?? getDefaultOnlineStatus();
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

    public get activeJob(): SyncJob | null {
        return this._activeJob;
    }

    public isActive(): boolean {
        return this._connected && !this._disconnecting;
    }

    public async disconnect(options: SyncDisconnectOptions = {}): Promise<void> {
        if (options.reset && this.service.session === this) {
            this.resetOnDisconnect = true;
        }

        await this.stopSession();
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

        const wasOnline = this._online;

        this._online = online;

        void this.emit('onUpdated', { online });

        if (!online) {
            this.pushLocalChanges.cancel();
        }

        if (online && !wasOnline && this.autoPush && this._localChangesCount > 0) {
            this.pushLocalChanges();
        }
    }

    public async setup(options: SetupOptions = {}): Promise<void> {
        await this.asyncLock.run(async () => {
            if (!this.isActive()) {
                return;
            }

            await runSetup(this, options);
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

    public requireRemoteContainerUrl(modelClass: ModelConstructor): string {
        const syncModel =
            this.getRegisteredModels().find(({ model }) => model === modelClass) ??
            fail<never>(SoukaiError, `Failed resolving remote container for '${modelClass.modelName}' model`);

        return (
            this.service.containerUrls[modelClass.modelName]?.default ?? getDefaultRemoteContainerUrl(this, syncModel)
        );
    }

    protected async connect(onDisconnected: () => unknown): Promise<void> {
        this.onDisconnected = onDisconnected;

        await this.asyncLock.run(async () => {
            if (this.disconnecting) {
                return;
            }

            await autoSetup(this);

            if (this.disconnecting) {
                return;
            }

            this._connected = true;
            this.listen();

            await this.emit('onUpdated', {
                connected: true,
                online: this._online,
                syncing: false,
                localChangesCount: 0,
                error: null,
                setupCompleted: this.service.setupCompleted,
                containerUrls: this.service.containerUrls,
                externalSources: this.service.externalSources,
                activeJob: null,
            });

            for (const syncModel of this.getRegisteredModels()) {
                await initializeContainerUrls(this, syncModel);
            }
        });

        await this.refreshLocalChanges();
    }

    protected get models(): SyncApplicationModel[] {
        return this.service.models;
    }

    protected getRegisteredModels(): SyncApplicationModel[] {
        return this.models.filter((syncModel) => !!syncModel.registration);
    }

    protected lock<T>(operation: () => Promise<T>): Promise<T> {
        return this.asyncLock.run(operation);
    }

    protected canSynchronize(): boolean {
        return this.isActive() && this.service.setupCompleted && this.online && !this.syncing;
    }

    protected async emit<TEvent extends keyof SyncListener>(
        event: TEvent,
        ...payload: ListenerPayload<SyncListener, TEvent>
    ): Promise<void> {
        const config = this.config;

        await this.listeners?.emit(event, ...payload);
        await (config[event] as ((...args: typeof payload) => unknown) | undefined)?.call(config, ...payload);
    }

    private stopSession(): Promise<void> {
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

            try {
                if (this.resetOnDisconnect) {
                    await invade(this.service, ['resetState']).resetState();
                }
            } finally {
                await this.onDisconnected?.();
            }
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
                    ({ model: instance }) => this.service.setupCompleted && trackUnlistedContainerUrls(this, instance),
                ),
            );
        }
    }
}
