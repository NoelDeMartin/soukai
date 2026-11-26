import { NetworkRequestFailed, SolidDocument, UnsuccessfulNetworkRequest } from '@noeldemartin/solid-utils';
import type { SolidResponse, CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import {
    Semaphore,
    arrayGroupBy,
    arrayFilter,
    arrayUnique,
    isInstanceOf,
    isTruthy,
    objectFromEntries,
    parseDate,
    required,
    round,
    silenced,
    urlRoute,
} from '@noeldemartin/utils';
import {
    clearPushedLocalChanges,
    isCreatedLocalChange,
    isDeletedLocalChange,
    isUpdatedLocalChange,
    mergeLocalChanges,
    subtractLocalChanges,
    withCreatedAsUpdated,
    withoutResourceLocalChanges,
} from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import type {
    DocumentLocalChanges,
    LocalChangesUpdate,
    LocalFile,
    ResourceLocalChanges,
} from 'soukai-bis/engines/LocalEngine';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { getEngine, getRemoteEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import JobCancelledError from 'soukai-bis/errors/JobCancelledError';
import JobFailedError from 'soukai-bis/errors/JobFailedError';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Job from 'soukai-bis/jobs/Job';
import { getExternalSourceUrl, isInExternalSource, type ExternalSource } from 'soukai-bis/jobs/sync/external-sources';
import type { JobListener, JobStatus } from 'soukai-bis/jobs/types';
import { isNonRDFResource } from 'soukai-bis/lib/internals/files';
import { LDP_CONTAINS_PREDICATE, RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { safeContainerUrl } from 'soukai-bis/lib/internals/urls';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import { getResourceOperationUrls } from 'soukai-bis/models/concerns/crdts';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import type Operation from 'soukai-bis/models/crdts/Operation';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { TypeIndexRegistration } from 'soukai-bis/models/interop/TypeIndex';
import type TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import Container from 'soukai-bis/models/ldp/Container';
import type Resource from 'soukai-bis/models/ldp/Resource';
import { getRemoteContainerUrl } from 'soukai-bis/models/ldp/utils';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import {
    getDocumentResolution,
    getLocalDeletions,
    getRemoteDeletions,
    getRestoredLinksOperations,
    groupDeletions,
} from './concerns/deletions';
import type {
    ResourceConflict,
    ResourceConflictResolution,
    DeletionsResolution,
    SyncingDocument,
} from './concerns/deletions';
import {
    applyOperationsToDocument,
    documentWithoutSubjects,
    documentWithTombstones,
    getSyncDocumentOperations,
    getTombstonedResourceUrls,
    getTombstoneUrls,
    withoutTombstones,
} from './concerns/document-operations';
import { FilesSyncStrategies, getFileConflictType, isFileUpToDate } from './concerns/files';
import type {
    FileConflict,
    FileConflictResolution,
    FilePushedEvent,
    SyncFilesModel,
    FilesSyncStrategy,
    PulledFiles,
    RemoteFile,
    SyncFilesConfig,
} from './concerns/files';
import { getFixMalformedAttributesModels, getMalformedDocumentUpdates } from './concerns/malformed-attributes';
import { addRegisteredModels, syncContainerRegistration, syncInstanceRegistration } from './concerns/registrations';
import type {
    ModelRegistration,
    ModelRegistrationMode,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
} from './concerns/registrations';

export type { ResourceConflict, ResourceConflictResolution, ResourceConflictType } from './concerns/deletions';
export { FilesSyncStrategies } from './concerns/files';
export type {
    FileConflict,
    FileConflictResolution,
    FileConflictType,
    FilePushedEvent,
    FilesSyncStrategy,
    SyncFilesConfig,
} from './concerns/files';
export type {
    ModelRegistrationMode,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
} from './concerns/registrations';

const DEFAULT_MAX_ERRORS = 10;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_LAST_MODIFIED_TOLERANCE = 1000;
const NON_RDF_HTTP_STATUS_CODES = new Set([406, 415, 501]);

export type SyncConflict = ResourceConflict | FileConflict;
export type SyncConflictResolution = ResourceConflictResolution | FileConflictResolution;

export function isFileConflict(conflict: SyncConflict): conflict is FileConflict {
    return conflict.type.startsWith('file-');
}

export function isResourceConflict(conflict: SyncConflict): conflict is ResourceConflict {
    return conflict.type.startsWith('resource-');
}

export interface SyncJobConfig {
    userProfile: CompleteSolidUserProfile;
    publicTypeIndexes?: TypeIndex[];
    privateTypeIndexes?: TypeIndex[];
    applicationModels: SyncApplicationModel[];
    externalSources?: ExternalSource[];
    maxErrors?: number;
    concurrency?: number;
    lastModifiedTolerance?: number;
    fixMalformedAttributes?: boolean;
    createPublicTypeIndex?(): Promise<TypeIndex>;
    createPrivateTypeIndex?(): Promise<TypeIndex>;
    resolveConflict?(conflict: SyncConflict): Promise<SyncConflictResolution>;
}

export interface SyncJobStatus extends JobStatus {
    root?: boolean;
    children: [JobStatus, JobStatus, JobStatus];
}

export interface SyncApplicationModel {
    model: ModelConstructor;
    registration: boolean | { path?: string; public?: boolean; mode?: ModelRegistrationMode };
    files?: SyncFilesConfig[];
    fixMalformedAttributes?: boolean;
}

export function getSyncModelRemoteContainerUrl(
    syncModel: SyncApplicationModel,
    userProfile: CompleteSolidUserProfile,
): string {
    const path = typeof syncModel.registration === 'object' ? syncModel.registration.path : undefined;

    return getRemoteContainerUrl(syncModel.model, userProfile.storageUrls[0], path);
}

export interface SyncTask {
    url: string;
    status?: JobStatus;
    remoteUpdatedAt?: Date;
}

export interface SyncJobResult {
    syncedDocumentUrls: Set<string>;
    documentsWithErrors: Set<string>;
    syncedFileUrls: Set<string>;
}

export interface SyncJobListener extends JobListener<SyncJobResult, SyncJobResult> {
    onFilePushed?(event: FilePushedEvent): unknown;
    onModelsRegistered?(event: ModelsRegisteredEvent): unknown;
    onModelsRegistrationFailed?(event: ModelsRegistrationFailedEvent): unknown;
    onExternalSourceFailed?(source: ExternalSource, error: unknown): unknown;
    onProfileUpdated?(profile: CompleteSolidUserProfile): unknown;
}

export default class SyncJob extends Job<SyncJobResult, SyncJobResult, SyncJobStatus, SyncJobListener> {
    public static async run(config: SyncJobConfig & SyncJobListener): Promise<void> {
        const job = new SyncJob(config);

        job.listeners.add({
            onModelsRegistered: (event) => config.onModelsRegistered?.(event),
            onModelsRegistrationFailed: (event) => config.onModelsRegistrationFailed?.(event),
            onExternalSourceFailed: (source, error) => config.onExternalSourceFailed?.(source, error),
            onFilePushed: (event) => config.onFilePushed?.(event),
            onProfileUpdated: (profile) => config.onProfileUpdated?.(profile),
            onUpdated: (progress) => config.onUpdated?.(progress),
            onFinished: (result) => config.onFinished?.(result),
            onCancelled: (partialResult) => config.onCancelled?.(partialResult),
        });

        await job.process();
    }

    public readonly documentsWithErrors = new Set<string>();
    public readonly syncedDocumentUrls = new Set<string>();
    public readonly syncedFileUrls = new Set<string>();
    public readonly failedExternalSources = new Map<ExternalSource, unknown>();
    private syncSemaphore: Semaphore;
    private conflictsSemaphore: Semaphore;
    private syncedModels: ModelConstructor[];
    private fixMalformedAttributesModels: ModelConstructor[];
    private modelRegistrations: Map<ModelConstructor, ModelRegistration>;
    private ownDocumentsWithErrors = new Set<string>();
    private registeredContainers = new Map<string, Set<ModelConstructor>>();
    private registeredInstances = new Map<string, Set<ModelConstructor>>();
    private documentsLastModifiedAt = new Map<string, Date | null>();
    private documentsLocalChanges = new Map<string, DocumentLocalChanges>();
    private pushedLocalChanges = new Map<string, DocumentLocalChanges>();
    private remoteDocumentsWithDeletions: SolidDocument[] = [];
    private typeIndexes: Partial<Record<TypeIndexRegistration, Promise<TypeIndex>>> = {};
    private unsyncedContainers = new Set<string>();
    private containerFilesConfigs = new Map<string, Promise<SyncFilesConfig[]>>();
    private documentFilesConfigs: Promise<Map<string, SyncFilesConfig[]>> | null = null;
    private documentFilesConfigsOutdated = false;
    private forcePushFileUrls = new Set<string>();
    private pulledFiles = new Map<string, PulledFiles>();
    private updatedDocumentUrls = new Set<string>();

    declare private localEngine: LocalEngine;
    declare private remoteEngine: SolidEngine;

    public constructor(private config: SyncJobConfig) {
        super();

        this.syncSemaphore = new Semaphore(config.concurrency ?? DEFAULT_CONCURRENCY);
        this.conflictsSemaphore = new Semaphore(1);
        this.modelRegistrations = new Map(
            this.config.applicationModels
                .map((model) => {
                    if (!model.registration) {
                        return;
                    }

                    const options = typeof model.registration === 'object' ? model.registration : {};
                    const registration: ModelRegistration = {
                        containerUrl: getSyncModelRemoteContainerUrl(model, this.config.userProfile),
                        visibility: options.public ? 'public' : 'private',
                        mode: options.mode ?? 'container',
                    };

                    return [model.model, registration] as const;
                })
                .filter(isTruthy),
        );
        this.syncedModels = Array.from(this.config.applicationModels)
            .map((model) => model.model)
            .concat(this.getExternalSources().flatMap((source) => source.models))
            .concat([Container]);
        this.fixMalformedAttributesModels = getFixMalformedAttributesModels(
            this.config.applicationModels,
            this.config.fixMalformedAttributes,
        );
    }

    private get syncsFiles(): boolean {
        return this.config.applicationModels.some((model) => (model.files?.length ?? 0) > 0);
    }

    private get downloadsFiles(): boolean {
        return this.config.applicationModels.some((model) => model.files?.some((files) => files.availableOffline));
    }

    private get lastModifiedTolerance(): number {
        return this.config.lastModifiedTolerance ?? DEFAULT_LAST_MODIFIED_TOLERANCE;
    }

    protected async run(): Promise<SyncJobResult> {
        this.prepareEngines();

        try {
            await this.prepareDocumentsLastModifiedAt();
            await this.prepareDocumentsLocalChanges();
            await this.syncRemoteDocuments();
            await this.syncLocalDocuments();
            await this.downloadFiles();
            await this.finish();
        } finally {
            await this.reportFailedExternalSources();
        }

        return this.getResult();
    }

    private prepareEngines(): void {
        const localEngine = getEngine();
        const remoteEngine = getRemoteEngine();

        if (!localEngine) {
            throw new SoukaiError("Can't run SyncJob without a default engine, call setEngine() first");
        }

        if (!isLocalEngine(localEngine)) {
            throw new SoukaiError(
                `Can't run SyncJob with a default engine that isn't local (${localEngine.static().engineName})`,
            );
        }

        if (!remoteEngine) {
            throw new SoukaiError("Can't run SyncJob without a remote engine, call setRemoteEngine() first");
        }

        this.localEngine = localEngine;
        this.remoteEngine = remoteEngine;
    }

    private async prepareDocumentsLocalChanges(): Promise<void> {
        this.documentsLocalChanges = new Map(Object.entries(await this.localEngine.getDocumentsLocalChanges()));
    }

    private clearLocalChanges(
        syncedDocument: SolidDocument,
        pushedChanges: DocumentLocalChanges | null,
        resolvedUrls: Set<string> = new Set(),
    ): LocalChangesUpdate | undefined {
        if (!pushedChanges) {
            return undefined;
        }

        this.pushedLocalChanges.set(syncedDocument.url, withoutResourceLocalChanges(pushedChanges, resolvedUrls));

        return (changes) => clearPushedLocalChanges(changes, pushedChanges, syncedDocument);
    }

    private clearPushedFileLocalChanges(
        fileUrl: string,
        pushedChanges: DocumentLocalChanges | null,
    ): LocalChangesUpdate | undefined {
        if (!pushedChanges) {
            return undefined;
        }

        this.pushedLocalChanges.set(fileUrl, pushedChanges);

        return (changes) => subtractLocalChanges(changes, pushedChanges);
    }

    private async updateSyncedDocument(
        syncedDocument: SolidDocument,
        operations: EngineOperation[],
        options: {
            lastModifiedAt: Date | null;
            pushedChanges: DocumentLocalChanges | null;
            resolvedUrls?: Set<string>;
        },
    ): Promise<void> {
        const { lastModifiedAt, pushedChanges, resolvedUrls } = options;
        const documentUrl = syncedDocument.url;

        try {
            await this.localEngine.updateDocument(documentUrl, operations, {
                lastModifiedAt,
                localChanges: this.clearLocalChanges(syncedDocument, pushedChanges, resolvedUrls),
            });

            this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);
            this.trackUpdatedDocument(documentUrl);
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound) || !pushedChanges) {
                throw error;
            }

            const droppedRemoteUpdates = operations.length > 0;
            const recreatedLastModifiedAt = droppedRemoteUpdates ? null : lastModifiedAt;

            await this.localEngine.createDocument(documentUrl, [], {
                lastModifiedAt: recreatedLastModifiedAt,
                localChanges: () => clearPushedLocalChanges(null, pushedChanges, syncedDocument),
            });

            this.documentsLastModifiedAt.set(documentUrl, recreatedLastModifiedAt);
            this.trackUpdatedDocument(documentUrl);
        }
    }

    private getExternalSources(): ExternalSource[] {
        return this.config.externalSources ?? [];
    }

    private findExternalSource(url: string): ExternalSource | null {
        return this.getExternalSources().find((source) => isInExternalSource(source, url)) ?? null;
    }

    private async reportFailedExternalSources(): Promise<void> {
        for (const [source, error] of this.failedExternalSources) {
            await this._listeners.emit('onExternalSourceFailed', source, error);
        }
    }

    protected override getInitialStatus(): SyncJobStatus {
        return {
            root: true,
            completed: false,
            children: [{ completed: false }, { completed: false }, { completed: false }],
        };
    }

    protected override calculateCurrentProgress(status?: JobStatus): number {
        status ??= this.status;

        const syncStatus = status as SyncJobStatus;

        if (syncStatus.root) {
            const [remoteDocumentsProgress, localDocumentsProgress, downloadProgress] = syncStatus.children.map(
                (child) => (child ? this.calculateCurrentProgress(child) : 0),
            ) as [number, number, number];

            return this.downloadsFiles
                ? round(remoteDocumentsProgress * 0.8 + localDocumentsProgress * 0.1 + downloadProgress * 0.1, 2)
                : round(remoteDocumentsProgress * 0.9 + localDocumentsProgress * 0.1, 2);
        }

        return super.calculateCurrentProgress(status);
    }

    private getResult(): SyncJobResult {
        return {
            syncedDocumentUrls: this.syncedDocumentUrls,
            documentsWithErrors: this.documentsWithErrors,
            syncedFileUrls: this.syncedFileUrls,
        };
    }

    private async getDocumentOperations(
        document: SolidDocument,
        resourceUrls: string[],
    ): Promise<Map<string, ModelWithUrl<Operation>>> {
        const allOperations = (await Promise.all(
            getCoreOperationModels().map((model) => model.fromDocument(document).all()),
        )) as ModelWithUrl<Operation>[][];

        const operations = allOperations.flat().filter((operation) => resourceUrls.includes(operation.resourceUrl));

        return new Map(operations.map((operation) => [operation.url, operation]));
    }

    private async skipDocumentSync(documentUrl: string, remoteUpdatedAt?: Date): Promise<boolean> {
        const lastModifiedAt = this.documentsLastModifiedAt.get(documentUrl);

        if (!remoteUpdatedAt || !lastModifiedAt || this.documentsLocalChanges.has(documentUrl)) {
            return false;
        }

        const localTimestamp = lastModifiedAt.getTime();
        const remoteTimestamp = remoteUpdatedAt.getTime();

        if (localTimestamp === remoteTimestamp) {
            return true;
        }

        if (Math.abs(remoteTimestamp - localTimestamp) <= this.lastModifiedTolerance) {
            await this.localEngine.updateDocument(documentUrl, [], {
                lastModifiedAt: remoteUpdatedAt,
            });

            this.documentsLastModifiedAt.set(documentUrl, remoteUpdatedAt);

            return true;
        }

        return false;
    }

    private async prepareDocumentsLastModifiedAt(): Promise<void> {
        const documentsLastModifiedAt = await this.localEngine.getDocumentsLastModifiedAt();

        this.documentsLastModifiedAt = new Map(Object.entries(documentsLastModifiedAt));
    }

    private async prepareUnsyncedContainers(): Promise<void> {
        this.unsyncedContainers = new Set<string>();

        for (const url of this.documentsLocalChanges.keys()) {
            let containerUrl: string | null = url.endsWith('/') ? url : safeContainerUrl(url);

            while (containerUrl !== null) {
                if (this.unsyncedContainers.has(containerUrl)) {
                    break;
                }

                this.unsyncedContainers.add(containerUrl);

                containerUrl = safeContainerUrl(containerUrl);
            }
        }
    }

    private async finish(): Promise<void> {
        await ComputedAttributesCache.invalidate({
            documentUrls: [...this.syncedDocumentUrls, ...this.syncedFileUrls],
        });
    }

    private shouldPullDocument(document: SolidDocument): boolean {
        return (
            !document.url.endsWith('/') ||
            document
                .getQuads()
                .some(
                    (quad) =>
                        !quad.predicate.equals(RDF_TYPE_PREDICATE) && !quad.predicate.equals(LDP_CONTAINS_PREDICATE),
                )
        );
    }

    private async syncRemoteDocuments(): Promise<void> {
        await this.initializeMatchingContainers();

        const containerUrls = Array.from(this.registeredContainers.keys());
        const instanceDocumentUrls = Array.from(this.registeredInstances.keys()).map((url) => urlRoute(url));
        const externalSourceUrls = this.getExternalSources().map((source) => getExternalSourceUrl(source));
        const urls = arrayUnique([...containerUrls, ...instanceDocumentUrls, ...externalSourceUrls]);
        const remoteDocumentsStatus = this.requireStatus().children[0];

        remoteDocumentsStatus.children = urls.map(() => ({ completed: false }));

        await this.syncDocuments(urls, remoteDocumentsStatus);
        await this.syncDocumentsWithDeletions();
        await this.pullFiles();
        await this.updateProgress((status) => (status.children[0].completed = true));
    }

    private async syncDocuments(urls: string[], remoteDocumentsStatus: JobStatus): Promise<void> {
        let ongoing = 0;
        let failed = false;

        const queue = urls.map((url, index) => ({
            url,
            status: remoteDocumentsStatus.children?.[index],
        }));

        return new Promise<void>((resolve, reject) => {
            const next = () => {
                if (failed) {
                    return;
                }

                while (queue.length > 0 && this.syncSemaphore.isAvailable()) {
                    const syncTask = queue.shift() as SyncTask;

                    ongoing++;

                    // oxlint-disable-next-line typescript/no-floating-promises
                    this.runSyncTask(syncTask, queue, {
                        onFinished: () => {
                            ongoing--;

                            if (ongoing === 0 && queue.length === 0) {
                                resolve();

                                return;
                            }

                            next();
                        },
                        onFailed: (error) => {
                            failed = true;

                            reject(error);
                        },
                    });
                }

                if (ongoing === 0 && queue.length === 0 && !failed) {
                    resolve();
                }
            };

            next();
        });
    }

    private async runSyncTask(
        syncTask: SyncTask,
        queue: SyncTask[],
        options: {
            onFinished: () => void;
            onFailed: (error: unknown) => void;
        },
    ): Promise<void> {
        try {
            const childSyncTasks = await this.syncSemaphore.run(() => {
                return this.syncDocument(syncTask.url, syncTask.status, syncTask.remoteUpdatedAt);
            });

            queue.unshift(...childSyncTasks);
        } catch (error) {
            options.onFailed(error);
        } finally {
            options.onFinished();
        }
    }

    private async syncLocalDocuments(): Promise<void> {
        await this.prepareUnsyncedContainers();
        await this.syncLocalContainer(this.config.userProfile.storageUrls[0], this.requireStatus().children[1]);
        await this.syncLocalExternalSources();
        await this.updateProgress((status) => (status.children[1].completed = true));
    }

    private async syncLocalExternalSources(): Promise<void> {
        for (const source of this.getExternalSources()) {
            if (this.documentsWithErrors.has(getExternalSourceUrl(source))) {
                continue;
            }

            if (source.containerUrl !== undefined) {
                await this.syncLocalContainer(source.containerUrl, undefined, { register: false });

                continue;
            }

            await this.syncLocalInstanceDocument(urlRoute(source.instanceUrl));
        }
    }

    private async syncLocalInstanceDocument(documentUrl: string): Promise<void> {
        this.assertNotCancelled(this.getResult());

        if (!this.documentsLocalChanges.has(documentUrl)) {
            return;
        }

        try {
            await this.syncLocalChildrenDocuments([documentUrl]);
        } catch (error) {
            this.handleDocumentError(documentUrl, error);
        }
    }

    private async initializeMatchingContainers(): Promise<void> {
        const typeIndexes = [...(this.config.publicTypeIndexes ?? []), ...(this.config.privateTypeIndexes ?? [])];

        for (const typeIndex of typeIndexes) {
            const registrations = typeIndex.registrations ?? [];

            for (const registration of registrations) {
                if (registration.instanceContainer) {
                    addRegisteredModels(
                        this.registeredContainers,
                        registration.instanceContainer,
                        this.getRegisteredApplicationModels(registration),
                    );

                    continue;
                }

                if (registration.instance) {
                    addRegisteredModels(
                        this.registeredInstances,
                        registration.instance,
                        this.getRegisteredApplicationModels(registration),
                    );
                }
            }
        }

        this.initializeRegistrationModes();
    }

    private initializeRegistrationModes(): void {
        const isRegisteredIn = (registry: Map<string, Set<ModelConstructor>>, model: ModelConstructor) =>
            Array.from(registry.values()).some((models) => models.has(model));

        for (const [model, registration] of this.modelRegistrations) {
            if (isRegisteredIn(this.registeredContainers, model)) {
                registration.mode = 'container';

                continue;
            }

            if (isRegisteredIn(this.registeredInstances, model)) {
                registration.mode = 'instance';
            }
        }
    }

    private getRegisteredApplicationModels(registration: TypeRegistration): ModelConstructor[] {
        return this.config.applicationModels
            .filter((model) => model.registration && registration.registers(model.model))
            .map((model) => model.model);
    }

    private async syncDocument(documentUrl: string, status?: JobStatus, remoteUpdatedAt?: Date): Promise<SyncTask[]> {
        this.assertNotCancelled(this.getResult());

        if (this.syncedDocumentUrls.has(documentUrl)) {
            return [];
        }

        this.syncedDocumentUrls.add(documentUrl);

        try {
            if (await this.skipDocumentSync(documentUrl, remoteUpdatedAt)) {
                return [];
            }

            const { remoteDocument, childrenSyncTasks } = await this.syncRemoteChildren(documentUrl, status);
            const localChanges = await this.localEngine.getDocumentLocalChanges(documentUrl);
            const localDocument = await this.localEngine.readDocumentIfExists(documentUrl, {
                includeEmptyDocuments: true,
            });

            if (!localDocument && remoteDocument) {
                if (!this.shouldPullDocument(remoteDocument)) {
                    return childrenSyncTasks;
                }

                let pulledDocument = remoteDocument;
                let lastModifiedAt: Date | null;
                const malformedUpdates =
                    this.fixMalformedAttributesModels.length > 0 && !this.findExternalSource(documentUrl)
                        ? await getMalformedDocumentUpdates(remoteDocument, this.fixMalformedAttributesModels)
                        : [];

                if (malformedUpdates.length > 0) {
                    const start = new Date();
                    const response = await this.remoteEngine.updateDocument(remoteDocument.url, malformedUpdates);
                    const end = new Date();

                    pulledDocument = applyOperationsToDocument(remoteDocument, malformedUpdates);
                    lastModifiedAt = this.getDocumentLastModifiedAt(start, end, response);
                } else {
                    lastModifiedAt = remoteDocument.url.endsWith('/')
                        ? this.deferPulledFilesLastModifiedAt(
                              documentUrl,
                              this.getContainerLastModifiedAt(remoteDocument),
                          )
                        : remoteDocument.getLastModified();
                }

                await this.localEngine.createDocument(documentUrl, withoutTombstones(pulledDocument.getQuads()), {
                    lastModifiedAt,
                });

                this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);
                this.trackUpdatedDocument(documentUrl);

                return childrenSyncTasks;
            }

            if (!remoteDocument || !localDocument) {
                return childrenSyncTasks;
            }

            const syncingDocument = { localDocument, remoteDocument, localChanges };

            if (getRemoteDeletions(syncingDocument).length > 0 || getLocalDeletions(syncingDocument).length > 0) {
                this.remoteDocumentsWithDeletions.push(remoteDocument);

                return childrenSyncTasks;
            }

            await this.syncDocumentContents(localDocument, remoteDocument, localChanges);

            return childrenSyncTasks;
        } catch (error) {
            if (this.isNonRDFDocumentError(error)) {
                this.syncedDocumentUrls.delete(documentUrl);

                if (this.syncsFiles && !documentUrl.endsWith('/')) {
                    this.queuePulledFiles(
                        documentUrl,
                        arrayFilter([await this.localEngine.getLocalFile(documentUrl)]),
                        [{ url: documentUrl, updatedAt: remoteUpdatedAt }],
                        new Set([documentUrl]),
                    );
                }
            } else if (!isInstanceOf(error, DocumentNotFound)) {
                this.handleDocumentError(documentUrl, error);
            }

            return [];
        } finally {
            if (status) {
                await this.updateProgress(
                    () => (status.completed ||= !status.children || status.children.length === 0),
                );
            }
        }
    }

    private async syncDocumentsWithDeletions(): Promise<void> {
        const remoteDocuments = this.remoteDocumentsWithDeletions;

        this.remoteDocumentsWithDeletions = [];

        if (remoteDocuments.length === 0) {
            return;
        }

        const documents = await Promise.all(
            remoteDocuments.map(async (remoteDocument) => {
                const [localChanges, localDocument] = await Promise.all([
                    this.localEngine.getDocumentLocalChanges(remoteDocument.url),
                    this.localEngine.readDocumentIfExists(remoteDocument.url, { includeEmptyDocuments: true }),
                ]);

                return localDocument && { localDocument, remoteDocument, localChanges };
            }),
        );
        const syncingDocuments = documents.filter(isTruthy);
        const resolution = await this.resolveDeletions(syncingDocuments);

        await Promise.all(
            syncingDocuments.map((document) =>
                this.syncSemaphore.run(() => this.syncDocumentWithDeletions(document, resolution)),
            ),
        );
    }

    private async syncDocumentWithDeletions(document: SyncingDocument, resolution: DeletionsResolution): Promise<void> {
        try {
            await this.syncDocumentContents(
                document.localDocument,
                document.remoteDocument,
                document.localChanges,
                getDocumentResolution(resolution, document),
            );
        } catch (error) {
            if (isInstanceOf(error, DocumentNotFound)) {
                return;
            }

            this.handleDocumentError(document.remoteDocument.url, error);
        }
    }

    private async syncRemoteChildren(
        documentUrl: string,
        status?: JobStatus,
    ): Promise<{ remoteDocument: SolidDocument | null; childrenSyncTasks: SyncTask[] }> {
        const remoteDocument = await this.remoteEngine.readDocumentIfExists(documentUrl);

        if (remoteDocument && documentUrl.endsWith('/')) {
            const container = await Container.fromDocument(remoteDocument).find(documentUrl);
            const resources = container?.resources ?? [];
            const resourcesByUrl = objectFromEntries(
                resources.map((document) => [document.url, document]).filter(([url]) => !!url) as [string, Resource][],
            );

            const remoteQuads = remoteDocument.getQuads();
            const remoteChildUrls = container?.resourceUrls ?? [];
            const localFiles = this.syncsFiles
                ? await this.localEngine.getLocalFiles({ containerUrl: documentUrl })
                : [];
            const localFileUrls = new Set(localFiles.map((file) => file.url));
            const { fileUrls, resourceUrls } = arrayGroupBy(remoteChildUrls, (childDocumentUrl) =>
                isNonRDFResource(remoteQuads, childDocumentUrl) || localFileUrls.has(childDocumentUrl)
                    ? 'fileUrls'
                    : 'resourceUrls',
            );
            const remoteFiles = (fileUrls ?? []).map((url) => ({
                url,
                mimeType: resourcesByUrl[url]?.mimeType,
                updatedAt: resourcesByUrl[url]?.updatedAt,
            }));

            if (this.syncsFiles) {
                this.queuePulledFiles(documentUrl, localFiles, remoteFiles, new Set(remoteChildUrls));
            }

            if (status && resourceUrls && resourceUrls.length > 0) {
                status.children = resourceUrls.map(() => ({ completed: false }));

                await this.updateProgress();
            }

            const childrenSyncTasks = (resourceUrls ?? []).map((childDocumentUrl, index) => {
                const childResource = resourcesByUrl[childDocumentUrl];
                const childStatus = status?.children?.[index];

                return {
                    url: childDocumentUrl,
                    status: childStatus,
                    remoteUpdatedAt: childDocumentUrl.endsWith('/')
                        ? childResource?.deepUpdatedAt
                        : childResource?.updatedAt,
                };
            });

            return { remoteDocument, childrenSyncTasks };
        }

        return { remoteDocument, childrenSyncTasks: [] };
    }

    private async syncLocalContainer(
        url: string,
        status?: JobStatus,
        options: { register?: boolean } = {},
    ): Promise<void> {
        this.assertNotCancelled(this.getResult());

        if (!this.unsyncedContainers.has(url)) {
            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }

            return;
        }

        try {
            const document = await this.localEngine.readDocumentIfExists(url, { includeEmptyDocuments: true });
            const container = document && (await Container.fromDocument(document).find(url));

            if (!container) {
                return;
            }

            const localFiles = await this.localEngine.getLocalFiles({ containerUrl: url });
            const localFileUrls = new Set(localFiles.map((file) => file.url));
            const { containerChildren, documentChildren } = arrayGroupBy(
                container.resourceUrls.filter((childUrl) => !localFileUrls.has(childUrl)),
                (childUrl) => (childUrl.endsWith('/') ? 'containerChildren' : 'documentChildren'),
            );

            const pendingUrls = (documentChildren ?? []).filter(
                (pendingUrl) => !this.syncedDocumentUrls.has(pendingUrl),
            );
            const containerChildrenUrls = containerChildren ?? [];
            const pendingFiles = await this.getPendingFiles(localFiles);
            const allChildrenUrls = [...pendingUrls, ...containerChildrenUrls, ...pendingFiles.map((file) => file.url)];

            if (status && allChildrenUrls.length > 0) {
                status.children = allChildrenUrls.map(() => ({ completed: false }));

                await this.updateProgress();
            }

            const { syncedModelDocuments, syncedModelInstances } = await this.syncLocalChildrenDocuments(
                pendingUrls,
                status,
            );

            await this.syncLocalFiles(
                pendingFiles,
                status?.children?.slice(pendingUrls.length + containerChildrenUrls.length),
            );

            if (options.register === false) {
                await Promise.all(
                    containerChildrenUrls.map((containerUrl) =>
                        this.syncLocalContainer(containerUrl, undefined, options),
                    ),
                );

                return;
            }

            const onModelsRegistered = (event: ModelsRegisteredEvent) => {
                return this._listeners.emit('onModelsRegistered', event);
            };
            const onModelsRegistrationFailed = async (event: ModelsRegistrationFailedEvent) => {
                await this.markDocumentsAsUnsynced(
                    event.models.flatMap((model) => syncedModelDocuments.get(model) ?? []),
                );
                await this._listeners.emit('onModelsRegistrationFailed', event);
            };

            await syncInstanceRegistration({
                instances: syncedModelInstances,
                registeredInstances: this.registeredInstances,
                modelRegistrations: this.modelRegistrations,
                getTypeIndex: (visibility) => this.getTypeIndex(visibility),
                onModelsRegistered,
                onModelsRegistrationFailed,
            });

            await syncContainerRegistration({
                container,
                models: new Set(
                    Array.from(syncedModelDocuments.keys()).filter(
                        (model) => this.modelRegistrations.get(model)?.mode !== 'instance',
                    ),
                ),
                registeredContainers: this.registeredContainers,
                modelRegistrations: this.modelRegistrations,
                getTypeIndex: (visibility) => this.getTypeIndex(visibility),
                onModelsRegistered,
                onModelsRegistrationFailed,
            });

            await Promise.all(
                containerChildrenUrls.map((containerUrl, index) => {
                    const childStatus = status?.children?.[pendingUrls.length + index];

                    return this.syncLocalContainer(containerUrl, childStatus);
                }),
            );
        } catch (error) {
            this.handleDocumentError(url, error);
        } finally {
            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }
        }
    }

    private getTypeIndex(visibility: TypeIndexRegistration): Promise<TypeIndex> {
        return (this.typeIndexes[visibility] ??= this.findOrCreateTypeIndex(visibility));
    }

    private async findOrCreateTypeIndex(visibility: TypeIndexRegistration): Promise<TypeIndex> {
        const existingTypeIndex =
            visibility === 'public' ? this.config.publicTypeIndexes?.[0] : this.config.privateTypeIndexes?.[0];

        if (existingTypeIndex) {
            return existingTypeIndex;
        }

        if (visibility === 'public' && this.config.createPublicTypeIndex) {
            return this.config.createPublicTypeIndex();
        }

        if (visibility === 'private' && this.config.createPrivateTypeIndex) {
            return this.config.createPrivateTypeIndex();
        }

        const typeIndex =
            visibility === 'public'
                ? await TypeIndex.createPublic(this.config.userProfile)
                : await TypeIndex.createPrivate(this.config.userProfile);

        await this._listeners.emit('onProfileUpdated', this.config.userProfile);

        return typeIndex;
    }

    private async markDocumentsAsUnsynced(documentUrls: string[]): Promise<void> {
        for (const documentUrl of documentUrls) {
            const pushedChanges = this.pushedLocalChanges.get(documentUrl);

            if (!pushedChanges) {
                continue;
            }

            try {
                await this.localEngine.updateDocument(documentUrl, [], {
                    localChanges: (changes) => mergeLocalChanges(changes, withCreatedAsUpdated(pushedChanges)),
                });
            } catch (error) {
                if (isInstanceOf(error, DocumentNotFound)) {
                    continue;
                }

                throw error;
            }
        }
    }

    private async syncLocalChildrenDocuments(
        pendingUrls: string[] = [],
        status?: JobStatus,
    ): Promise<{
        syncedModelDocuments: Map<ModelConstructor, string[]>;
        syncedModelInstances: Map<ModelConstructor, string[]>;
    }> {
        const syncedDocumentResources = new Map<string, Map<string, Set<string>>>();
        const currentLocalChanges = await this.localEngine.getDocumentsLocalChanges();
        const localDocuments = await this.localEngine.readDocuments({
            urls: pendingUrls.filter((url) => url in currentLocalChanges),
            includeEmptyDocuments: true,
        });

        await Promise.all(
            pendingUrls.map(async (documentUrl, index) => {
                const childStatus = status?.children?.[index];
                const localDocument = localDocuments[documentUrl];

                if (!localDocument) {
                    if (childStatus) {
                        await this.updateProgress(() => (childStatus.completed = true));
                    }

                    return;
                }

                try {
                    const localChanges = currentLocalChanges[documentUrl] ?? null;
                    const start = new Date();
                    const syncResult = await this.syncLocalDocument(localDocument, localChanges);
                    const end = new Date();

                    if (!syncResult) {
                        await silenced(this.localEngine.deleteDocument(documentUrl, { ifMatch: { status: 'empty' } }), {
                            ignore: [PreconditionFailed, DocumentNotFound],
                        });

                        return;
                    }

                    if (!syncResult.mergedWithExistingDocument) {
                        const lastModifiedAt = documentUrl.endsWith('/')
                            ? this.getContainerLastModifiedAt(syncResult.remoteDocument)
                            : this.getDocumentLastModifiedAt(start, end, syncResult.remoteDocument);

                        await this.updateSyncedDocument(localDocument, [], {
                            lastModifiedAt,
                            pushedChanges: localChanges,
                        });
                    }

                    const documentResources = new Map<string, Set<string>>();
                    for (const quad of localDocument.statements(undefined, RDF_TYPE_PREDICATE)) {
                        const resourceId =
                            quad.subject.termType === 'BlankNode' ? `_:${quad.subject.value}` : quad.subject.value;
                        const resourceRDFClasses = documentResources.get(resourceId) ?? new Set();

                        resourceRDFClasses.add(quad.object.value);
                        documentResources.set(resourceId, resourceRDFClasses);
                    }

                    syncedDocumentResources.set(documentUrl, documentResources);
                } catch (error) {
                    this.handleDocumentError(documentUrl, error);
                } finally {
                    if (childStatus) {
                        await this.updateProgress(() => (childStatus.completed = true));
                    }
                }
            }),
        );

        const syncedModelDocuments = new Map<ModelConstructor, string[]>();
        const syncedModelInstances = new Map<ModelConstructor, string[]>();
        const syncedDocuments = pendingUrls
            .filter((documentUrl) => syncedDocumentResources.has(documentUrl))
            .map((documentUrl) => {
                const resources = syncedDocumentResources.get(documentUrl) ?? new Map<string, Set<string>>();
                const rdfClasses = new Set(
                    Array.from(resources.values()).flatMap((resourceClasses) => [...resourceClasses]),
                );

                return { documentUrl, resources, rdfClasses };
            });

        for (const model of this.config.applicationModels) {
            if (!model.registration) {
                continue;
            }

            const hasModelClasses = (rdfClasses: Set<string>) => model.model.matchesRDFClasses(rdfClasses);

            if (this.modelRegistrations.get(model.model)?.mode !== 'instance') {
                const documentUrls = syncedDocuments
                    .filter(({ rdfClasses }) => hasModelClasses(rdfClasses))
                    .map(({ documentUrl }) => documentUrl);

                if (documentUrls.length > 0) {
                    syncedModelDocuments.set(model.model, documentUrls);
                }

                continue;
            }

            const documentUrls: string[] = [];
            const instanceUrls: string[] = [];

            for (const { documentUrl, resources } of syncedDocuments) {
                const documentInstanceUrls = Array.from(resources.entries())
                    .filter(([resourceId, rdfClasses]) => !resourceId.startsWith('_:') && hasModelClasses(rdfClasses))
                    .map(([resourceUrl]) => resourceUrl);

                if (documentInstanceUrls.length === 0) {
                    continue;
                }

                documentUrls.push(documentUrl);
                instanceUrls.push(...documentInstanceUrls);
            }

            if (documentUrls.length > 0) {
                syncedModelDocuments.set(model.model, documentUrls);
                syncedModelInstances.set(model.model, instanceUrls);
            }
        }

        return { syncedModelDocuments, syncedModelInstances };
    }

    private async syncLocalDocument(
        localDocument: SolidDocument,
        localChanges: DocumentLocalChanges | null,
    ): Promise<{ remoteDocument: SolidDocument; mergedWithExistingDocument: boolean } | null> {
        this.assertNotCancelled(this.getResult());

        this.syncedDocumentUrls.add(localDocument.url);

        const quads = localDocument.getQuads();

        if (quads.length === 0) {
            const remoteDocument = await this.remoteEngine.readDocumentIfExists(localDocument.url);

            if (!remoteDocument) {
                return null;
            }

            await this.syncDocumentContents(localDocument, remoteDocument, localChanges);

            return { remoteDocument, mergedWithExistingDocument: true };
        }

        try {
            const remoteDocument = await this.remoteEngine.createDocument(localDocument.url, quads);

            return { remoteDocument, mergedWithExistingDocument: false };
        } catch (error) {
            if (!(error instanceof DocumentAlreadyExists)) {
                throw error;
            }

            await this.syncDocumentContents(localDocument, error.document, localChanges);

            return { remoteDocument: error.document, mergedWithExistingDocument: true };
        }
    }

    private getSyncedResourceUrls(document: SolidDocument): string[] {
        const resourceTypes = new Map<string, Set<string>>();

        for (const quad of document.getQuads()) {
            if (!quad.predicate.equals(RDF_TYPE_PREDICATE)) {
                continue;
            }

            const types = resourceTypes.get(quad.subject.value) ?? new Set<string>();

            types.add(quad.object.value);
            resourceTypes.set(quad.subject.value, types);
        }

        return Array.from(resourceTypes.entries())
            .filter(([_, types]) => this.syncedModels.some((model) => model.matchesRDFClasses(types)))
            .map(([resourceUrl]) => resourceUrl);
    }

    private async syncDocumentContents(
        localDocument: SolidDocument,
        remoteDocument: SolidDocument,
        localChanges: DocumentLocalChanges | null,
        deletionsResolution?: DeletionsResolution,
    ): Promise<void> {
        this.assertNotCancelled(this.getResult());

        const resolution =
            deletionsResolution ?? (await this.resolveDeletions([{ localDocument, remoteDocument, localChanges }]));
        const restoredTombstoneUrls = getTombstoneUrls(remoteDocument, resolution.restoredRemoteResources);
        const remoteTombstonedUrls = getTombstonedResourceUrls(remoteDocument);
        const localMergeDocument = documentWithTombstones(
            localDocument,
            Array.from(resolution.localDeletions).filter(
                (url) => remoteDocument.contains(url) && !remoteTombstonedUrls.has(url),
            ),
        );
        const remoteMergeDocument = documentWithTombstones(
            documentWithoutSubjects(remoteDocument, restoredTombstoneUrls),
            Array.from(resolution.discardedLocalResources).filter((url) => !remoteTombstonedUrls.has(url)),
        );
        const resourceUrls = arrayUnique(
            [remoteMergeDocument, localMergeDocument].flatMap((document) => this.getSyncedResourceUrls(document)),
        );
        const localOperations = await this.getDocumentOperations(localMergeDocument, resourceUrls);
        const remoteOperations = await this.getDocumentOperations(remoteMergeDocument, resourceUrls);
        const restoredLinksOperations = [
            ...getRestoredLinksOperations({
                linkingDocument: localDocument,
                unlinkingDocument: remoteDocument,
                restoredUrls: resolution.restoredRemoteResources,
                resourceUrls,
                models: this.syncedModels,
            }),
            ...getRestoredLinksOperations({
                linkingDocument: remoteDocument,
                unlinkingDocument: localDocument,
                restoredUrls: resolution.restoredLocalResources,
                resourceUrls,
                models: this.syncedModels,
            }),
        ];
        const remoteUpdates = [
            ...restoredTombstoneUrls.map((tombstoneUrl) => new DeleteResourceOperation(tombstoneUrl)),
            ...(await getSyncDocumentOperations({
                resourceUrls,
                document: remoteMergeDocument,
                otherDocument: localMergeDocument,
                existingOperations: Array.from(remoteOperations.values()),
                newOperations: [
                    ...Array.from(localOperations.values()).filter(
                        (operation) =>
                            !remoteOperations.has(operation.url) &&
                            !resolution.discardedLocalResources.has(operation.resourceUrl),
                    ),
                    ...restoredLinksOperations,
                ],
            })),
        ];

        const shouldFixMalformed =
            this.fixMalformedAttributesModels.length > 0 && !this.findExternalSource(remoteDocument.url);
        const allRemoteUpdates = remoteUpdates.concat(
            shouldFixMalformed
                ? await getMalformedDocumentUpdates(
                      applyOperationsToDocument(remoteMergeDocument, remoteUpdates),
                      this.fixMalformedAttributesModels,
                  )
                : [],
        );

        const start = new Date();
        const response = await this.remoteEngine.updateDocument(remoteDocument.url, allRemoteUpdates);
        const end = new Date();
        const updatedRemoteDocument = applyOperationsToDocument(remoteMergeDocument, allRemoteUpdates);
        const updatedRemoteOperations = await this.getDocumentOperations(updatedRemoteDocument, resourceUrls);

        const lastModifiedAt = localDocument.url.endsWith('/')
            ? this.deferPulledFilesLastModifiedAt(
                  localDocument.url,
                  this.getContainerLastModifiedAt(response) ?? this.getContainerLastModifiedAt(remoteDocument),
              )
            : this.getDocumentLastModifiedAt(start, end, response);

        const localUpdates = await getSyncDocumentOperations({
            resourceUrls,
            document: localDocument,
            otherDocument: updatedRemoteDocument,
            existingOperations: Array.from(localOperations.values()),
            newOperations: Array.from(updatedRemoteOperations.values()).filter(
                (operation) => !localOperations.has(operation.url),
            ),
            copyTombstones: false,
        });
        const allLocalUpdates = localUpdates.concat(
            shouldFixMalformed
                ? await getMalformedDocumentUpdates(
                      applyOperationsToDocument(localDocument, localUpdates),
                      this.fixMalformedAttributesModels,
                  )
                : [],
        );

        await this.updateSyncedDocument(localDocument, allLocalUpdates, {
            lastModifiedAt,
            pushedChanges: localChanges,
            resolvedUrls: new Set([...resolution.discardedLocalResources, ...resolution.restoredLocalResources]),
        });

        if (this.documentFilesConfigs) {
            this.documentFilesConfigsOutdated = true;
        }
    }

    private async resolveDeletions(documents: SyncingDocument[]): Promise<DeletionsResolution> {
        const resolution: DeletionsResolution = {
            localDeletions: new Set(),
            discardedLocalResources: new Set(),
            restoredRemoteResources: new Set(),
            restoredLocalResources: new Set(),
        };
        const remoteDeletions = await groupDeletions(
            documents.map((document) => document.localDocument),
            documents.flatMap(getRemoteDeletions),
            this.syncedModels,
        );
        const localDeletions = await groupDeletions(
            documents.map((document) => document.remoteDocument),
            documents.flatMap(getLocalDeletions),
            this.syncedModels,
        );
        const findDocument = (url: string, side: 'localDocument' | 'remoteDocument') =>
            required(documents.find((document) => document[side].contains(url)));

        for (const [resourceUrl, urls] of remoteDeletions) {
            const hasLocalChanges = Array.from(urls).some((url) =>
                documents.some((document) => !!document.localChanges?.resources[url]),
            );
            const { localDocument, remoteDocument } = findDocument(resourceUrl, 'localDocument');
            const answer = hasLocalChanges
                ? await this.getResourceConflictResolution({
                      type: 'resource-deleted-remotely',
                      resourceUrl,
                      localDocument,
                      remoteDocument,
                  })
                : 'delete';
            const resolvedUrls =
                answer === 'delete' ? resolution.discardedLocalResources : resolution.restoredRemoteResources;

            urls.forEach((url) => resolvedUrls.add(url));
        }

        for (const [resourceUrl, urls] of localDeletions) {
            const { localDocument, remoteDocument } = findDocument(resourceUrl, 'remoteDocument');
            const hasUnseenRemoteChanges = Array.from(urls).some((url) =>
                this.hasUnseenRemoteChanges(url, findDocument(url, 'remoteDocument')),
            );
            const answer = hasUnseenRemoteChanges
                ? await this.getResourceConflictResolution({
                      type: 'resource-deleted-locally',
                      resourceUrl,
                      localDocument,
                      remoteDocument,
                  })
                : 'delete';
            const resolvedUrls = answer === 'delete' ? resolution.localDeletions : resolution.restoredLocalResources;

            urls.forEach((url) => resolvedUrls.add(url));
        }

        return resolution;
    }

    private async getResourceConflictResolution(
        conflict: Omit<ResourceConflict, 'model'>,
    ): Promise<ResourceConflictResolution> {
        if (!this.config.resolveConflict) {
            return 'delete';
        }

        const model = await this.findResourceConflictModel(conflict);
        const answer = await this.getConflictResolution({ ...conflict, model });

        return this.validateConflictResolution(conflict.type, conflict.resourceUrl, answer, ['delete', 'restore']);
    }

    private async findResourceConflictModel(conflict: Omit<ResourceConflict, 'model'>): Promise<Model | null> {
        const document =
            conflict.type === 'resource-deleted-remotely' ? conflict.localDocument : conflict.remoteDocument;

        for (const modelClass of this.syncedModels) {
            if (modelClass === Container) {
                continue;
            }

            const model = await silenced(
                modelClass.fromDocument(document).find(conflict.resourceUrl, { includeSoftDeleted: true }),
            );

            if (model) {
                return model;
            }
        }

        return null;
    }

    private hasUnseenRemoteChanges(url: string, { remoteDocument, localChanges }: SyncingDocument): boolean {
        const resourceChanges = localChanges?.resources[url];

        if (!resourceChanges || !isDeletedLocalChange(resourceChanges)) {
            return true;
        }

        return getResourceOperationUrls(remoteDocument, url).some(
            (operationUrl) => !resourceChanges.deletedOperations?.includes(operationUrl),
        );
    }

    private getDocumentLastModifiedAt(
        start: Date,
        end: Date,
        remoteDocument: SolidDocument | SolidResponse | null,
    ): Date {
        const lastModifiedAt =
            remoteDocument instanceof SolidDocument
                ? remoteDocument.getLastModified()
                : parseDate(remoteDocument?.headers.get('last-modified'));

        if (lastModifiedAt) {
            return lastModifiedAt;
        }

        const duration = end.getTime() - start.getTime();
        const requestDate = parseDate(remoteDocument?.headers.get('Date')) ?? start;

        return new Date(requestDate.getTime() + duration);
    }

    private getContainerLastModifiedAt(remoteDocument: SolidDocument | SolidResponse | null): Date | null {
        const lastModifiedAt =
            remoteDocument instanceof SolidDocument
                ? remoteDocument.statement(remoteDocument.url, 'extra:deepLastModified')?.object.value
                : null;

        return lastModifiedAt ? parseDate(lastModifiedAt) : null;
    }

    private trackUpdatedDocument(url: string): void {
        if (url.endsWith('/')) {
            return;
        }

        this.updatedDocumentUrls.add(url);
    }

    private queuePulledFiles(
        url: string,
        localFiles: LocalFile[],
        remoteFiles: RemoteFile[],
        remoteChildUrls: Set<string>,
    ): void {
        const localFilesByUrl = new Map(localFiles.map((file) => [file.url, file] as const));
        const updatedFiles = remoteFiles.filter((remoteFile) => {
            const localFile = localFilesByUrl.get(remoteFile.url);

            return (
                this.documentsLocalChanges.has(remoteFile.url) ||
                !localFile ||
                !isFileUpToDate(localFile, remoteFile, this.lastModifiedTolerance)
            );
        });
        const deletedFiles = localFiles.filter((localFile) => !remoteChildUrls.has(localFile.url));

        if (updatedFiles.length === 0 && deletedFiles.length === 0) {
            return;
        }

        this.pulledFiles.set(url, { url, localFiles, updatedFiles, deletedFiles });
    }

    private deferPulledFilesLastModifiedAt(url: string, lastModifiedAt: Date | null): Date | null {
        const pulledFiles = this.pulledFiles.get(url);

        if (!pulledFiles) {
            return lastModifiedAt;
        }

        pulledFiles.lastModifiedAt = lastModifiedAt;

        return null;
    }

    private async pullFiles(): Promise<void> {
        const pulledFiles = Array.from(this.pulledFiles.values());

        this.pulledFiles.clear();

        await Promise.all(
            pulledFiles.map((files) =>
                this.syncSemaphore.run(async () => {
                    try {
                        await this.pullContainerFiles(files);

                        if (files.lastModifiedAt !== undefined) {
                            await this.localEngine.updateDocument(files.url, [], {
                                lastModifiedAt: files.lastModifiedAt,
                            });

                            this.documentsLastModifiedAt.set(files.url, files.lastModifiedAt);
                        }
                    } catch (error) {
                        this.handleDocumentError(files.url, error);
                    }
                }),
            ),
        );
    }

    private async pullContainerFiles({ localFiles, updatedFiles, deletedFiles }: PulledFiles): Promise<void> {
        const localFilesByUrl = new Map(localFiles.map((file) => [file.url, file] as const));

        for (const remoteFile of await this.filterSyncedFiles(updatedFiles)) {
            if (this.documentsLocalChanges.has(remoteFile.url)) {
                await this.syncModifiedFile(localFilesByUrl.get(remoteFile.url), remoteFile);

                continue;
            }

            await this.pullFileMetadata(remoteFile);
        }

        for (const localFile of await this.filterSyncedFiles(deletedFiles)) {
            if (isUpdatedLocalChange(this.getFileLocalChanges(localFile.url))) {
                await this.resolveFileConflict({
                    type: 'file-deleted-remotely',
                    url: localFile.url,
                    localFile,
                    remoteUpdatedAt: null,
                });

                continue;
            }

            if (this.documentsLocalChanges.has(localFile.url)) {
                continue;
            }

            await this.localEngine.deleteFile(localFile.url);

            this.syncedFileUrls.add(localFile.url);
        }
    }

    private async syncModifiedFile(localFile: LocalFile | undefined, remoteFile: RemoteFile): Promise<void> {
        if (!localFile) {
            return;
        }

        const conflictType = getFileConflictType(
            localFile,
            remoteFile,
            this.getFileLocalChanges(localFile.url),
            this.lastModifiedTolerance,
        );

        if (!conflictType) {
            return;
        }

        await this.resolveFileConflict(
            {
                type: conflictType,
                url: localFile.url,
                localFile,
                remoteUpdatedAt: remoteFile.updatedAt ?? null,
            },
            remoteFile,
        );
    }

    private getFileLocalChanges(url: string): ResourceLocalChanges | undefined {
        return this.documentsLocalChanges.get(url)?.resources[url];
    }

    private async resolveFileConflict(conflict: FileConflict, remoteFile?: RemoteFile): Promise<void> {
        const resolution = await this.getFileConflictResolution(conflict);

        if (resolution === 'keep-local') {
            this.forcePushFileUrls.add(conflict.url);

            return;
        }

        this.documentsLocalChanges.delete(conflict.url);

        await this.localEngine.deleteFile(conflict.url);

        if (conflict.type === 'file-deleted-remotely') {
            this.syncedFileUrls.add(conflict.url);

            return;
        }

        const pulledFile = remoteFile ?? (await this.readRemoteFile(conflict.url));

        await this.pullFileMetadata({ ...pulledFile, mimeType: pulledFile.mimeType ?? conflict.localFile.mimeType });
    }

    private async readRemoteFile(url: string): Promise<RemoteFile> {
        const metadata = await this.remoteEngine.readFileMetadata(url);

        return { url, mimeType: metadata?.mimeType, updatedAt: metadata?.lastModifiedAt };
    }

    private async getFileConflictResolution(conflict: FileConflict): Promise<FileConflictResolution> {
        const answer = await this.getConflictResolution(conflict);

        return this.validateConflictResolution(conflict.type, conflict.url, answer, ['keep-local', 'keep-remote']);
    }

    private validateConflictResolution<T extends SyncConflictResolution>(
        type: SyncConflict['type'],
        url: string,
        answer: SyncConflictResolution | undefined,
        resolutions: [T, ...T[]],
    ): T {
        const [defaultResolution] = resolutions;

        if (!answer) {
            return defaultResolution;
        }

        if (!resolutions.includes(answer as T)) {
            // oxlint-disable-next-line no-console
            console.warn(
                `Invalid '${answer}' resolution for ${type} conflict in ${url}, using '${defaultResolution}' instead.`,
            );

            return defaultResolution;
        }

        return answer as T;
    }

    private async getConflictResolution(conflict: SyncConflict): Promise<SyncConflictResolution | undefined> {
        if (!this.config.resolveConflict) {
            return;
        }

        const answer = await this.conflictsSemaphore.run(async () => this.config.resolveConflict?.(conflict));

        this.assertNotCancelled(this.getResult());

        return answer;
    }

    private async pullFileMetadata(remoteFile: RemoteFile): Promise<void> {
        const availableOffline = await this.isAvailableOffline(remoteFile.url);

        await this.localEngine.updateFile(remoteFile.url, {
            blob: null,
            mimeType: remoteFile.mimeType,
            lastModifiedAt: remoteFile.updatedAt ?? null,
            availableOffline,
        });

        this.syncedFileUrls.add(remoteFile.url);
    }

    private async downloadFiles(): Promise<void> {
        const downloadStatus = this.requireStatus().children[2];

        try {
            if (!this.downloadsFiles) {
                return;
            }

            const downloads = await this.getPendingDownloads();

            downloadStatus.children = downloads.map(() => ({ completed: false }));

            await this.updateProgress();
            await Promise.all(
                downloads.map((download, index) =>
                    this.syncSemaphore.run(async () => {
                        const fileStatus = downloadStatus.children?.[index];

                        await this.downloadFile(download.url, download.localFile);

                        if (fileStatus) {
                            await this.updateProgress(() => (fileStatus.completed = true));
                        }
                    }),
                ),
            );
        } finally {
            await this.updateProgress(() => (downloadStatus.completed = true));
        }
    }

    private async getPendingDownloads(): Promise<{ url: string; localFile?: LocalFile }[]> {
        const localFiles = await this.localEngine.getLocalFiles();
        const localFileUrls = new Set(localFiles.map((file) => file.url));
        const downloads: { url: string; localFile?: LocalFile }[] = localFiles
            .filter(
                (file) =>
                    file.availableOffline &&
                    !file.hasLocalContents &&
                    !file.deleted &&
                    !this.documentsLocalChanges.has(file.url),
            )
            .map((file) => ({ url: file.url, localFile: file }));

        if (this.updatedDocumentUrls.size === 0) {
            return downloads;
        }

        for (const [url, configs] of await this.getDocumentFilesConfigs()) {
            if (
                localFileUrls.has(url) ||
                this.documentsLocalChanges.has(url) ||
                !configs.some((c) => c.availableOffline)
            ) {
                continue;
            }

            downloads.push({ url });
        }

        return downloads;
    }

    private async downloadFile(url: string, localFile?: LocalFile): Promise<void> {
        this.assertNotCancelled(this.getResult());

        try {
            if (!localFile) {
                await this.localEngine.updateFile(url, { availableOffline: true });
            }

            const blob = await this.remoteEngine.readFileIfExists(url);

            if (!blob) {
                if (!localFile) {
                    await this.localEngine.deleteFile(url);
                }

                return;
            }

            await this.localEngine.updateFile(url, {
                blob,
                mimeType: localFile?.mimeType ?? (blob.type || undefined),
                availableOffline: true,
            });

            this.syncedFileUrls.add(url);
        } catch (error) {
            this.handleDocumentError(url, error);
        }
    }

    private getPendingFiles(files: LocalFile[]): Promise<LocalFile[]> {
        return this.filterSyncedFiles(files.filter((file) => this.documentsLocalChanges.has(file.url)));
    }

    private async syncLocalFiles(files: LocalFile[], statuses: JobStatus[] = []): Promise<void> {
        await Promise.all(
            files.map((file, index) =>
                this.syncSemaphore.run(async () => {
                    const fileStatus = statuses[index];

                    await this.syncLocalFile(file);

                    if (fileStatus) {
                        await this.updateProgress(() => (fileStatus.completed = true));
                    }
                }),
            ),
        );
    }

    private async syncLocalFile(file: LocalFile): Promise<void> {
        this.assertNotCancelled(this.getResult());

        try {
            try {
                await this.pushFileChanges(file);
            } catch (error) {
                if (!this.isFileConflictError(file, error)) {
                    throw error;
                }

                await this.resolveFileConflict({
                    type: file.deleted ? 'file-deleted-locally' : 'file-modified',
                    url: file.url,
                    localFile: file,
                    remoteUpdatedAt: null,
                });

                if (this.forcePushFileUrls.has(file.url)) {
                    await this.pushFileChanges(file);
                }
            }
        } catch (error) {
            this.handleDocumentError(file.url, error);
        }
    }

    private async pushFileChanges(file: LocalFile): Promise<void> {
        const localChanges = await this.localEngine.getDocumentLocalChanges(file.url);
        const forcePush = this.forcePushFileUrls.has(file.url);
        const ifUnmodifiedSince = forcePush ? undefined : this.getFileIfUnmodifiedSince(file);

        if (file.deleted) {
            await this.remoteEngine.deleteFile(file.url, { ifUnmodifiedSince });

            if ((await this.localEngine.getLocalFile(file.url))?.deleted) {
                await this.localEngine.deleteFile(file.url);
            } else {
                await this.localEngine.updateFile(file.url, { lastModifiedAt: null });
            }

            this.syncedFileUrls.add(file.url);

            return;
        }

        const blob = await this.localEngine.readFileIfExists(file.url);

        if (!blob) {
            throw new SoukaiError(`Can't push file ${file.url} because its contents are not available locally`);
        }

        const isNewFile = !file.lastModifiedAt && isCreatedLocalChange(localChanges?.resources[file.url]);
        const start = new Date();
        const response =
            isNewFile && !forcePush
                ? await this.remoteEngine.createFile(file.url, blob, { mimeType: file.mimeType })
                : await this.remoteEngine.writeFile(file.url, blob, {
                      mimeType: file.mimeType,
                      ifUnmodifiedSince,
                  });
        const end = new Date();
        const availableOffline = await this.isAvailableOffline(file);

        await this.localEngine.updateFile(
            file.url,
            {
                lastModifiedAt: this.getDocumentLastModifiedAt(start, end, response),
                availableOffline: availableOffline || undefined,
            },
            { localChanges: this.clearPushedFileLocalChanges(file.url, localChanges) },
        );

        if (!availableOffline && !(await this.localEngine.getDocumentLocalChanges(file.url))) {
            await this.localEngine.updateFile(file.url, { blob: null });
        }

        this.syncedFileUrls.add(file.url);

        if (!availableOffline) {
            await this._listeners.emit('onFilePushed', { url: file.url, blob });
        }
    }

    private isFileConflictError(file: LocalFile, error: unknown): boolean {
        return (
            !this.forcePushFileUrls.has(file.url) &&
            (isInstanceOf(error, PreconditionFailed) || isInstanceOf(error, FileAlreadyExists))
        );
    }

    private getFileIfUnmodifiedSince(file: LocalFile): Date | undefined {
        if (!file.lastModifiedAt) {
            return undefined;
        }

        return new Date(file.lastModifiedAt.getTime() + this.lastModifiedTolerance);
    }

    private async filterSyncedFiles<T extends { url: string }>(files: T[]): Promise<T[]> {
        const syncedFiles = await Promise.all(files.map((file) => this.isSyncedFile(file.url)));

        return files.filter((_, index) => syncedFiles[index]);
    }

    private async isSyncedFile(url: string): Promise<boolean> {
        const containerUrl = safeContainerUrl(url);

        if (containerUrl && (await this.getContainerFilesConfigs(containerUrl)).length > 0) {
            return true;
        }

        return (await this.getDocumentFilesConfigs()).has(url);
    }

    private async getFileConfigs(url: string): Promise<SyncFilesConfig[]> {
        const containerUrl = safeContainerUrl(url);
        const containerConfigs = containerUrl ? await this.getContainerFilesConfigs(containerUrl) : [];
        const documentConfigs = (await this.getDocumentFilesConfigs()).get(url) ?? [];

        return [...containerConfigs, ...documentConfigs];
    }

    private async isAvailableOffline(file: LocalFile | string): Promise<boolean> {
        if (typeof file !== 'string' && file.availableOffline) {
            return true;
        }

        const configs = await this.getFileConfigs(typeof file === 'string' ? file : file.url);

        return configs.some((config) => config.availableOffline);
    }

    private getContainerFilesConfigs(containerUrl: string): Promise<SyncFilesConfig[]> {
        const promise =
            this.containerFilesConfigs.get(containerUrl) ??
            (async () => {
                const models = this.getSyncFilesModels(FilesSyncStrategies.Container);

                if (models.length === 0) {
                    return [];
                }

                const documents = await silenced(this.localEngine.readDocuments({ containerUrl }), {
                    ignore: DocumentNotFound,
                    default: {} as Record<string, SolidDocument>,
                });
                const rdfClasses = new Set(
                    Object.values(documents)
                        .filter((document) => document.url !== containerUrl)
                        .flatMap((document) => document.statements(undefined, RDF_TYPE_PREDICATE))
                        .map((quad) => quad.object.value),
                );

                return models.filter(({ model }) => model.matchesRDFClasses(rdfClasses)).flatMap(({ files }) => files);
            })();

        this.containerFilesConfigs.set(containerUrl, promise);

        return promise;
    }

    private getDocumentFilesConfigs(): Promise<Map<string, SyncFilesConfig[]>> {
        if (this.documentFilesConfigsOutdated) {
            this.documentFilesConfigs = null;
            this.documentFilesConfigsOutdated = false;
        }

        return (this.documentFilesConfigs ??= this.inspectDocumentFiles());
    }

    private async inspectDocumentFiles(): Promise<Map<string, SyncFilesConfig[]>> {
        const filesConfigs = new Map<string, SyncFilesConfig[]>();
        const models = this.getSyncFilesModels(FilesSyncStrategies.Document);

        if (models.length === 0) {
            return filesConfigs;
        }

        for (const containerUrl of await this.localEngine.getContainerUrls()) {
            const documents = await silenced(this.localEngine.readDocuments({ containerUrl }), {
                ignore: DocumentNotFound,
                default: {} as Record<string, SolidDocument>,
            });

            for (const document of Object.values(documents)) {
                if (document.url.endsWith('/')) {
                    continue;
                }

                for (const { model, files } of models) {
                    const instances = await model.fromDocument(document).all();

                    for (const instance of instances) {
                        for (const config of files) {
                            for (const field of config.fields ?? []) {
                                const value = instance.getAttribute(field as never);
                                const urls = (Array.isArray(value) ? value : [value]).filter(
                                    (fileUrl): fileUrl is string => typeof fileUrl === 'string',
                                );

                                for (const fileUrl of urls) {
                                    filesConfigs.set(fileUrl, [...(filesConfigs.get(fileUrl) ?? []), config]);
                                }
                            }
                        }
                    }
                }
            }
        }

        return filesConfigs;
    }

    private getSyncFilesModels(strategy: FilesSyncStrategy): SyncFilesModel[] {
        return this.config.applicationModels
            .map((model) => ({
                model: model.model,
                files: (model.files ?? []).filter((files) => files.strategy === strategy),
            }))
            .filter((model) => model.files.length > 0);
    }

    private isNonRDFDocumentError(error: unknown): boolean {
        return (
            isInstanceOf(error, NetworkRequestFailed) &&
            isInstanceOf(error.cause, UnsuccessfulNetworkRequest) &&
            NON_RDF_HTTP_STATUS_CODES.has(error.cause.response.status)
        );
    }

    private handleDocumentError(documentUrl: string, error: unknown): void {
        if (error instanceof JobCancelledError || error instanceof JobFailedError) {
            throw error;
        }

        const maxErrors = this.config.maxErrors ?? DEFAULT_MAX_ERRORS;
        const externalSource = this.findExternalSource(documentUrl);

        this.documentsWithErrors.add(documentUrl);

        if (externalSource) {
            if (!this.failedExternalSources.has(externalSource)) {
                this.failedExternalSources.set(externalSource, error);
            }

            return;
        }

        this.ownDocumentsWithErrors.add(documentUrl);

        if (this.ownDocumentsWithErrors.size >= maxErrors) {
            throw new JobFailedError(`Too many errors during sync (${this.ownDocumentsWithErrors.size}).`);
        }
    }
}
