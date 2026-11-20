import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { Semaphore, coalesce, debounce, facade, fail } from '@noeldemartin/utils';
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
}

export interface SyncCompletedEvent {
    job: SyncJob | null;
    cancelled: boolean;
    error: unknown;
}

export interface SyncListener {
    onUpdated?(changes: Partial<SyncProperties>): unknown;
    onContainersUpdated?(modelClass: ModelConstructor, containerUrls: string[]): unknown;
    onJobStarted?(job: SyncJob): unknown;
    onFileUpdated?(url: string): unknown;
    onSyncStarted?(): unknown;
    onSyncCompleted?(event: SyncCompletedEvent): unknown;
    onSyncFailed?(error: unknown): unknown;
    onModelsRegistered?(event: ModelsRegisteredEvent): unknown;
    onModelsRegistrationFailed?(event: ModelsRegistrationFailedEvent): unknown;
    onExternalSourceFailed?(source: ExternalSource, error: unknown): unknown;
    onFilePushed?(event: FilePushedEvent): unknown;
}

export interface SyncSession extends SyncListener {
    userProfile: CompleteSolidUserProfile;
    online: boolean;
    autoPush?: boolean;
    containerUrls?: Record<string, ModelContainerUrls>;
    externalSources?: ExternalSource[];
    findTypeIndexes?(): Promise<SyncTypeIndexes>;
    createPublicTypeIndex?(): Promise<TypeIndex>;
    createPrivateTypeIndex?(): Promise<TypeIndex>;
    resolveDeletionConflict?(conflict: DeletionConflict): Promise<DeletionConflictResolution>;
    resolveFileConflict?(conflict: FileConflict): Promise<FileConflictResolution>;
}

export class SyncService {
    public readonly refreshLocalChanges = coalesce(() => updateLocalChanges(this));
    protected autoPush = true;
    protected models: SyncApplicationModel[] = [];
    protected activeJob: SyncJob | null = null;
    protected previousSyncPendingChangesets: LocalChangeset[] = [];
    private _connected = false;
    private _online = false;
    private _syncing = false;
    private _localChangesCount = 0;
    private _error: unknown = null;
    private _setupCompleted = false;
    private _containerUrls: Record<string, ModelContainerUrls> = {};
    private _externalSources: ExternalSource[] = [];
    private session: SyncSession | null = null;
    private userProfile: CompleteSolidUserProfile | null = null;
    private asyncLock = new Semaphore();
    private watchingLocalChanges = false;
    private pushLocalChanges = debounce(() => this.start(), 1000);

    public get connected(): boolean {
        return this._connected;
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

    public async trackModels(models: SyncApplicationModel[]): Promise<void> {
        const newModels = models.filter(({ model }) => !this.models.some((syncModel) => syncModel.model === model));

        for (const syncModel of newModels) {
            trackLocalChanges(syncModel.model);

            this.models.push(syncModel);

            if (syncModel.registration) {
                await initializeContainerUrls(this, syncModel);
            }

            syncModel.model.on(
                'created',
                ({ model }) => this.setupCompleted && trackUnlistedContainerUrls(this, model),
            );
        }

        if (!this.watchingLocalChanges) {
            requireLocalEngine().listeners.add({ onLocalChangesUpdated: () => this.refreshLocalChanges() });

            this.watchingLocalChanges = true;
        }

        await this.refreshLocalChanges();
    }

    public async connect(session: SyncSession): Promise<void> {
        await this.asyncLock.run(async () => {
            if (this.session) {
                throw new SoukaiError('Sync is already connected, call Sync.disconnect() first');
            }

            session.externalSources?.forEach((source) => assertExternalSourceModelsBooted(source));

            const setupCompleted = await isSetupCompleted();

            this.session = session;
            this.userProfile = session.userProfile;
            this.autoPush = session.autoPush ?? true;

            this._connected = true;
            this._online = session.online;
            this._setupCompleted = setupCompleted;
            this._containerUrls = session.containerUrls ?? {};
            this._externalSources = session.externalSources ?? [];

            await this.emit('onUpdated', {
                connected: true,
                online: this._online,
                syncing: false,
                localChangesCount: 0,
                error: null,
                setupCompleted: this.setupCompleted,
                containerUrls: this.containerUrls,
                externalSources: this._externalSources,
            });

            for (const syncModel of this.getRegisteredModels()) {
                await initializeContainerUrls(this, syncModel);
            }
        });

        await this.refreshLocalChanges();
    }

    public async disconnect(): Promise<void> {
        this._connected = false;
        this.pushLocalChanges.cancel();

        void this.activeJob?.cancel();

        await this.asyncLock.run(async () => {
            if (!this.session) {
                return;
            }

            this._connected = false;
            this._online = false;
            this._syncing = false;
            this._localChangesCount = 0;
            this._error = null;

            await this.emit('onUpdated', {
                connected: false,
                online: false,
                syncing: false,
                localChangesCount: 0,
                error: null,
            });

            this._setupCompleted = false;
            this._containerUrls = {};
            this._externalSources = [];
            this.session = null;
            this.userProfile = null;
            this.autoPush = true;
            this.activeJob = null;
            this.previousSyncPendingChangesets = [];
        });
    }

    public setUserProfile(userProfile: CompleteSolidUserProfile): void {
        if (!this.session) {
            return;
        }

        this.userProfile = userProfile;
    }

    public setAutoPush(autoPush: boolean): void {
        if (!this.session) {
            return;
        }

        this.autoPush = autoPush;

        if (!autoPush) {
            this.pushLocalChanges.cancel();
        }
    }

    public setOnline(online: boolean): void {
        if (!this.session) {
            return;
        }

        this._online = online;

        void this.emit('onUpdated', { online });
    }

    public async setup(): Promise<void> {
        this.requireSession();

        await this.asyncLock.run(async () => {
            if (!this.connected) {
                return;
            }

            await runSetup(this);
        });
    }

    public async start(): Promise<void> {
        if (!this.canStart()) {
            return;
        }

        await this.asyncLock.run(async () => {
            if (!this.canStart()) {
                return;
            }

            await runSync(this);
        });
    }

    public addExternalSource(source: ExternalSource): void {
        this.requireSession();

        if (this.hasExternalSource(source)) {
            return;
        }

        assertExternalSourceModelsBooted(source);

        this._externalSources = [...this._externalSources, source];

        void this.emit('onUpdated', { externalSources: this._externalSources });
    }

    public hasExternalSource(source: ExternalSource): boolean {
        const sourceUrl = getExternalSourceUrl(source);

        return this._externalSources.some((externalSource) => getExternalSourceUrl(externalSource) === sourceUrl);
    }

    public isInExternalSource(url: string): boolean {
        return this._externalSources.some((source) => isInExternalSource(source, url));
    }

    public async removeExternalSource(source: ExternalSource): Promise<void> {
        this.requireSession();

        await this.asyncLock.run(async () => {
            if (!this.connected) {
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

    protected getRegisteredModels(): SyncApplicationModel[] {
        return this.models.filter((syncModel) => !!syncModel.registration);
    }

    protected canStart(): boolean {
        return this.connected && this.setupCompleted && this.online && !this.syncing;
    }

    protected requireSession(): SyncSession {
        return this.session ?? fail<never>(SoukaiError, "Sync isn't connected, call Sync.connect() first");
    }

    protected requireUserProfile(): CompleteSolidUserProfile {
        return this.userProfile ?? fail<never>(SoukaiError, "Sync isn't connected, call Sync.connect() first");
    }

    protected async emit<TEvent extends keyof SyncListener>(
        event: TEvent,
        ...payload: Parameters<NonNullable<SyncListener[TEvent]>>
    ): Promise<void> {
        const session = this.session;

        await (session?.[event] as ((...args: typeof payload) => unknown) | undefined)?.call(session, ...payload);
    }
}

export default facade(SyncService);
