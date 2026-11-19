import { NetworkRequestFailed, SolidDocument, UnsuccessfulNetworkRequest } from '@noeldemartin/solid-utils';
import type { SolidResponse, CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import {
    Semaphore,
    arrayGroupBy,
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
    isDeletedLocalChange,
    mergeLocalChanges,
    withCreatedAsUpdated,
    withoutResourceLocalChanges,
} from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import type { DocumentLocalChanges, LocalChangesUpdate } from 'soukai-bis/engines/LocalEngine';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { getEngine, getRemoteEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import JobCancelledError from 'soukai-bis/errors/JobCancelledError';
import JobFailedError from 'soukai-bis/errors/JobFailedError';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Job from 'soukai-bis/jobs/Job';
import type { JobListener, JobStatus } from 'soukai-bis/jobs/types';
import { getExternalSourceUrl, isInExternalSource, type ExternalSource } from 'soukai-bis/jobs/utils';
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
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import {
    getDocumentResolution,
    getLocalDeletions,
    getRemoteDeletions,
    getRestoredLinksOperations,
    groupDeletions,
} from './concerns/sync-conflicts';
import type {
    DeletionConflict,
    DeletionConflictResolution,
    DeletionsResolution,
    SyncingDocument,
} from './concerns/sync-conflicts';
import {
    applyOperationsToDocument,
    documentWithoutSubjects,
    documentWithTombstones,
    getSyncDocumentOperations,
    getTombstonedResourceUrls,
    getTombstoneUrls,
    withoutTombstones,
} from './concerns/sync-document-operations';
import {
    addRegisteredModels,
    syncContainerRegistration,
    syncInstanceRegistration,
} from './concerns/sync-registrations';
import type {
    ModelRegistration,
    ModelRegistrationMode,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
} from './concerns/sync-registrations';

export type { DeletionConflict, DeletionConflictResolution, DeletionConflictType } from './concerns/sync-conflicts';
export type {
    ModelRegistrationMode,
    ModelsRegisteredEvent,
    ModelsRegistrationFailedEvent,
} from './concerns/sync-registrations';

const DEFAULT_MAX_ERRORS = 10;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_LAST_MODIFIED_TOLERANCE = 1000;
const IANA_MEDIA_TYPE_PREFIX = 'http://www.w3.org/ns/iana/media-types/';
const NON_RDF_HTTP_STATUS_CODES = new Set([406, 415, 501]);
const RDF_MEDIA_TYPES = new Set([
    'text/turtle',
    'application/ld+json',
    'application/n-triples',
    'application/n-quads',
    'text/n3',
    'application/rdf+xml',
    'application/trig',
]);

export interface SyncConfig {
    userProfile: CompleteSolidUserProfile;
    publicTypeIndexes?: TypeIndex[];
    privateTypeIndexes?: TypeIndex[];
    applicationModels: {
        model: ModelConstructor;
        registration: boolean | { path?: string; public?: boolean; mode?: ModelRegistrationMode };
    }[];
    externalSources?: ExternalSource[];
    maxErrors?: number;
    concurrency?: number;
    lastModifiedTolerance?: number;
    createPublicTypeIndex?(): Promise<TypeIndex>;
    createPrivateTypeIndex?(): Promise<TypeIndex>;
    resolveDeletionConflict?: (conflict: DeletionConflict) => Promise<DeletionConflictResolution>;
}

export interface SyncJobStatus extends JobStatus {
    root?: boolean;
    children: [JobStatus, JobStatus];
}

export interface PullTask {
    url: string;
    status?: JobStatus;
    remoteUpdatedAt?: Date;
}

export interface SyncJobResult {
    syncedDocumentUrls: Set<string>;
    documentsWithErrors: Set<string>;
}

export interface SyncJobListener extends JobListener<SyncJobResult, SyncJobResult> {
    onModelsRegistered?(event: ModelsRegisteredEvent): unknown;
    onModelsRegistrationFailed?(event: ModelsRegistrationFailedEvent): unknown;
    onExternalSourceFailed?(source: ExternalSource, error: unknown): unknown;
}

export default class Sync extends Job<SyncJobResult, SyncJobResult, SyncJobStatus, SyncJobListener> {
    public static async run(config: SyncConfig & SyncJobListener): Promise<void> {
        const job = new Sync(config);

        job.listeners.add({
            onModelsRegistered: (event) => config.onModelsRegistered?.(event),
            onModelsRegistrationFailed: (event) => config.onModelsRegistrationFailed?.(event),
            onExternalSourceFailed: (source, error) => config.onExternalSourceFailed?.(source, error),
            onUpdated: (progress) => config.onUpdated?.(progress),
            onFinished: (result) => config.onFinished?.(result),
            onCancelled: (partialResult) => config.onCancelled?.(partialResult),
        });

        await job.process();
    }

    public readonly documentsWithErrors = new Set<string>();
    public readonly syncedDocumentUrls = new Set<string>();
    public readonly failedExternalSources = new Map<ExternalSource, unknown>();
    private syncSemaphore: Semaphore;
    private conflictsSemaphore: Semaphore;
    private syncedModels: ModelConstructor[];
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

    declare private localEngine: LocalEngine;
    declare private remoteEngine: SolidEngine;

    public constructor(private config: SyncConfig) {
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
                        containerUrl: getRemoteContainerUrl(
                            model.model,
                            this.config.userProfile.storageUrls[0],
                            options.path,
                        ),
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
    }

    protected async run(): Promise<SyncJobResult> {
        this.prepareEngines();

        try {
            await this.prepareDocumentsLastModifiedAt();
            await this.prepareDocumentsLocalChanges();
            await this.pullChanges();
            await this.pushChanges();
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
            throw new SoukaiError("Can't run Sync without a default engine, call setEngine() first");
        }

        if (!isLocalEngine(localEngine)) {
            throw new SoukaiError(
                `Can't run Sync with a default engine that isn't local (${localEngine.static().engineName})`,
            );
        }

        if (!remoteEngine) {
            throw new SoukaiError("Can't run Sync without a remote engine, call setRemoteEngine() first");
        }

        this.localEngine = localEngine;
        this.remoteEngine = remoteEngine;
    }

    private async prepareDocumentsLocalChanges(): Promise<void> {
        this.documentsLocalChanges = new Map(Object.entries(await this.localEngine.getDocumentsLocalChanges()));
    }

    private clearLocalChanges(
        pushedDocument: SolidDocument,
        pushedChanges: DocumentLocalChanges | null,
        resolvedUrls: Set<string> = new Set(),
    ): LocalChangesUpdate | undefined {
        if (!pushedChanges) {
            return undefined;
        }

        this.pushedLocalChanges.set(pushedDocument.url, withoutResourceLocalChanges(pushedChanges, resolvedUrls));

        return (changes) => clearPushedLocalChanges(changes, pushedChanges, pushedDocument);
    }

    private async updateSyncedDocument(
        pushedDocument: SolidDocument,
        operations: EngineOperation[],
        options: {
            lastModifiedAt: Date | null;
            pushedChanges: DocumentLocalChanges | null;
            resolvedUrls?: Set<string>;
        },
    ): Promise<void> {
        const { lastModifiedAt, pushedChanges, resolvedUrls } = options;
        const documentUrl = pushedDocument.url;

        try {
            await this.localEngine.updateDocument(documentUrl, operations, {
                lastModifiedAt,
                localChanges: this.clearLocalChanges(pushedDocument, pushedChanges, resolvedUrls),
            });

            this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound) || !pushedChanges) {
                throw error;
            }

            const droppedRemoteUpdates = operations.length > 0;
            const recreatedLastModifiedAt = droppedRemoteUpdates ? null : lastModifiedAt;

            await this.localEngine.createDocument(documentUrl, [], {
                lastModifiedAt: recreatedLastModifiedAt,
                localChanges: () => clearPushedLocalChanges(null, pushedChanges, pushedDocument),
            });

            this.documentsLastModifiedAt.set(documentUrl, recreatedLastModifiedAt);
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
            children: [{ completed: false }, { completed: false }],
        };
    }

    protected override calculateCurrentProgress(status?: JobStatus): number {
        status ??= this.status;

        const syncStatus = status as SyncJobStatus;

        if (syncStatus.root) {
            const pullProgress = syncStatus.children[0] ? this.calculateCurrentProgress(syncStatus.children[0]) : 0;
            const pushProgress = syncStatus.children[1] ? this.calculateCurrentProgress(syncStatus.children[1]) : 0;

            return round(pullProgress * 0.9 + pushProgress * 0.1, 2);
        }

        return super.calculateCurrentProgress(status);
    }

    private getResult(): SyncJobResult {
        return {
            syncedDocumentUrls: this.syncedDocumentUrls,
            documentsWithErrors: this.documentsWithErrors,
        };
    }

    private async getDocumentOperations(
        document: SolidDocument,
        resourceUrls: string[],
    ): Promise<Map<string, ModelWithUrl<Operation>>> {
        const allOperations = (await Promise.all(
            getCoreOperationModels().map((model) => model.createManyFromDocument(document)),
        )) as ModelWithUrl<Operation>[][];

        const operations = allOperations.flat().filter((operation) => resourceUrls.includes(operation.resourceUrl));

        return new Map(operations.map((operation) => [operation.url, operation]));
    }

    private async skipDocumentPull(documentUrl: string, remoteUpdatedAt?: Date): Promise<boolean> {
        const lastModifiedAt = this.documentsLastModifiedAt.get(documentUrl);

        if (!remoteUpdatedAt || !lastModifiedAt || this.documentsLocalChanges.has(documentUrl)) {
            return false;
        }

        const localTimestamp = lastModifiedAt.getTime();
        const remoteTimestamp = remoteUpdatedAt.getTime();

        if (localTimestamp === remoteTimestamp) {
            return true;
        }

        const lastModifiedTolerance = this.config.lastModifiedTolerance ?? DEFAULT_LAST_MODIFIED_TOLERANCE;

        if (Math.abs(remoteTimestamp - localTimestamp) <= lastModifiedTolerance) {
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
        await ComputedAttributesCache.invalidate({ documentUrls: Array.from(this.syncedDocumentUrls) });
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

    private async pullChanges(): Promise<void> {
        await this.initializeMatchingContainers();

        const containerUrls = Array.from(this.registeredContainers.keys());
        const instanceDocumentUrls = Array.from(this.registeredInstances.keys()).map((url) => urlRoute(url));
        const externalSourceUrls = this.getExternalSources().map((source) => getExternalSourceUrl(source));
        const urls = arrayUnique([...containerUrls, ...instanceDocumentUrls, ...externalSourceUrls]);
        const pullStatus = this.requireStatus().children[0];

        pullStatus.children = urls.map(() => ({ completed: false }));

        await this.pullDocuments(urls, pullStatus);
        await this.syncDocumentsWithDeletions();
        await this.updateProgress((status) => (status.children[0].completed = true));
    }

    private async pullDocuments(urls: string[], pullStatus: JobStatus): Promise<void> {
        let ongoing = 0;
        let failed = false;

        const queue = urls.map((url, index) => ({
            url,
            status: pullStatus.children?.[index],
        }));

        return new Promise<void>((resolve, reject) => {
            const next = () => {
                if (failed) {
                    return;
                }

                while (queue.length > 0 && this.syncSemaphore.isAvailable()) {
                    const pullTask = queue.shift() as PullTask;

                    ongoing++;

                    // oxlint-disable-next-line typescript/no-floating-promises
                    this.runPullTask(pullTask, queue, {
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

    private async runPullTask(
        pullTask: PullTask,
        queue: PullTask[],
        options: {
            onFinished: () => void;
            onFailed: (error: unknown) => void;
        },
    ): Promise<void> {
        try {
            const childPullTasks = await this.syncSemaphore.run(() => {
                return this.syncDocument(pullTask.url, pullTask.status, pullTask.remoteUpdatedAt);
            });

            queue.unshift(...childPullTasks);
        } catch (error) {
            options.onFailed(error);
        } finally {
            options.onFinished();
        }
    }

    private async pushChanges(): Promise<void> {
        await this.prepareUnsyncedContainers();
        await this.pushContainerDocuments(this.config.userProfile.storageUrls[0], this.requireStatus().children[1]);
        await this.pushExternalSources();
        await this.updateProgress((status) => (status.children[1].completed = true));
    }

    private async pushExternalSources(): Promise<void> {
        for (const source of this.getExternalSources()) {
            if (this.documentsWithErrors.has(getExternalSourceUrl(source))) {
                continue;
            }

            if (source.containerUrl !== undefined) {
                await this.pushContainerDocuments(source.containerUrl, undefined, { register: false });

                continue;
            }

            await this.pushInstanceDocument(urlRoute(source.instanceUrl));
        }
    }

    private async pushInstanceDocument(documentUrl: string): Promise<void> {
        this.assertNotCancelled(this.getResult());

        if (!this.documentsLocalChanges.has(documentUrl)) {
            return;
        }

        try {
            await this.pushContainerChildrenDocuments([documentUrl]);
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

    private async syncDocument(documentUrl: string, status?: JobStatus, remoteUpdatedAt?: Date): Promise<PullTask[]> {
        this.assertNotCancelled(this.getResult());

        if (this.syncedDocumentUrls.has(documentUrl)) {
            return [];
        }

        this.syncedDocumentUrls.add(documentUrl);

        try {
            if (await this.skipDocumentPull(documentUrl, remoteUpdatedAt)) {
                return [];
            }

            const { remoteDocument, childrenPullTasks } = await this.syncRemoteChildren(documentUrl, status);
            const localChanges = await this.localEngine.getDocumentLocalChanges(documentUrl);
            const localDocument = await this.localEngine.readDocumentIfExists(documentUrl, {
                includeEmptyDocuments: true,
            });

            if (!localDocument && remoteDocument) {
                if (!this.shouldPullDocument(remoteDocument)) {
                    return childrenPullTasks;
                }

                const lastModifiedAt = remoteDocument.url.endsWith('/')
                    ? this.getContainerLastModifiedAt(remoteDocument)
                    : remoteDocument.getLastModified();

                await this.localEngine.createDocument(documentUrl, withoutTombstones(remoteDocument.getQuads()), {
                    lastModifiedAt,
                });

                this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);

                return childrenPullTasks;
            }

            if (!remoteDocument || !localDocument) {
                return childrenPullTasks;
            }

            const syncingDocument = { localDocument, remoteDocument, localChanges };

            if (getRemoteDeletions(syncingDocument).length > 0 || getLocalDeletions(syncingDocument).length > 0) {
                this.remoteDocumentsWithDeletions.push(remoteDocument);

                return childrenPullTasks;
            }

            await this.syncDocumentContents(localDocument, remoteDocument, localChanges);

            return childrenPullTasks;
        } catch (error) {
            if (this.isNonRDFDocumentError(error)) {
                this.syncedDocumentUrls.delete(documentUrl);
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
    ): Promise<{ remoteDocument: SolidDocument | null; childrenPullTasks: PullTask[] }> {
        const remoteDocument = await this.remoteEngine.readDocumentIfExists(documentUrl);

        if (remoteDocument && documentUrl.endsWith('/')) {
            const container = await Container.createFromDocument(remoteDocument, { url: documentUrl });
            const resources = container?.resources ?? [];
            const resourcesByUrl = objectFromEntries(
                resources.map((document) => [document.url, document]).filter(([url]) => !!url) as [string, Resource][],
            );

            const resourceUrls = (container?.resourceUrls ?? []).filter(
                (childDocumentUrl) => !this.isNonRDFResource(remoteDocument, childDocumentUrl),
            );

            if (status && resourceUrls.length > 0) {
                status.children = resourceUrls.map(() => ({ completed: false }));

                await this.updateProgress();
            }

            const childrenPullTasks = resourceUrls.map((childDocumentUrl, index) => {
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

            return { remoteDocument, childrenPullTasks };
        }

        return { remoteDocument, childrenPullTasks: [] };
    }

    private async pushContainerDocuments(
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
            const container = document && (await Container.createFromDocument(document, { url }));

            if (!container) {
                return;
            }

            const { containerChildren, documentChildren } = arrayGroupBy(container.resourceUrls, (childUrl) => {
                return childUrl.endsWith('/') ? 'containerChildren' : 'documentChildren';
            });

            const pendingUrls = (documentChildren ?? []).filter(
                (pendingUrl) => !this.syncedDocumentUrls.has(pendingUrl),
            );
            const allChildrenUrls = pendingUrls.concat(containerChildren ?? []);

            if (status && allChildrenUrls.length > 0) {
                status.children = allChildrenUrls.map(() => ({ completed: false }));

                await this.updateProgress();
            }

            const { pushedModels, pushedInstances } = await this.pushContainerChildrenDocuments(pendingUrls, status);

            if (options.register === false) {
                await Promise.all(
                    (containerChildren ?? []).map((containerUrl) =>
                        this.pushContainerDocuments(containerUrl, undefined, options),
                    ),
                );

                return;
            }

            const onModelsRegistered = (event: ModelsRegisteredEvent) => {
                return this._listeners.emit('onModelsRegistered', event);
            };
            const onModelsRegistrationFailed = async (event: ModelsRegistrationFailedEvent) => {
                await this.markDocumentsAsUnsynced(event.models.flatMap((model) => pushedModels.get(model) ?? []));
                await this._listeners.emit('onModelsRegistrationFailed', event);
            };

            await syncInstanceRegistration({
                instances: pushedInstances,
                registeredInstances: this.registeredInstances,
                modelRegistrations: this.modelRegistrations,
                getTypeIndex: (visibility) => this.getTypeIndex(visibility),
                onModelsRegistered,
                onModelsRegistrationFailed,
            });

            await syncContainerRegistration({
                container,
                models: new Set(
                    Array.from(pushedModels.keys()).filter(
                        (model) => this.modelRegistrations.get(model)?.mode !== 'instance',
                    ),
                ),
                registeredContainers: this.registeredContainers,
                modelRegistrations: this.modelRegistrations,
                getTypeIndex: (visibility) => this.getTypeIndex(visibility),
                onModelsRegistered,
                onModelsRegistrationFailed,
            });

            const containerChildrenUrls = containerChildren ?? [];

            await Promise.all(
                containerChildrenUrls.map((containerUrl, index) => {
                    const childStatus = status?.children?.[pendingUrls.length + index];

                    return this.pushContainerDocuments(containerUrl, childStatus);
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
        if (visibility === 'public') {
            return (
                this.config.publicTypeIndexes?.[0] ??
                (this.config.createPublicTypeIndex
                    ? await this.config.createPublicTypeIndex()
                    : await TypeIndex.createPublic(this.config.userProfile))
            );
        }

        return (
            this.config.privateTypeIndexes?.[0] ??
            (this.config.createPrivateTypeIndex
                ? await this.config.createPrivateTypeIndex()
                : await TypeIndex.createPrivate(this.config.userProfile))
        );
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

    private async pushContainerChildrenDocuments(
        pendingUrls: string[] = [],
        status?: JobStatus,
    ): Promise<{ pushedModels: Map<ModelConstructor, string[]>; pushedInstances: Map<ModelConstructor, string[]> }> {
        const pushedDocumentResources = new Map<string, Map<string, Set<string>>>();
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
                    const pushResult = await this.pushRemoteDocument(localDocument, localChanges);
                    const end = new Date();

                    if (!pushResult) {
                        await silenced(this.localEngine.deleteDocument(documentUrl, { ifMatch: { status: 'empty' } }), {
                            ignore: [PreconditionFailed, DocumentNotFound],
                        });

                        return;
                    }

                    if (!pushResult.mergedWithExistingDocument) {
                        const lastModifiedAt = documentUrl.endsWith('/')
                            ? this.getContainerLastModifiedAt(pushResult.remoteDocument)
                            : this.getDocumentLastModifiedAt(start, end, pushResult.remoteDocument);

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

                    pushedDocumentResources.set(documentUrl, documentResources);
                } catch (error) {
                    this.handleDocumentError(documentUrl, error);
                } finally {
                    if (childStatus) {
                        await this.updateProgress(() => (childStatus.completed = true));
                    }
                }
            }),
        );

        const pushedModels = new Map<ModelConstructor, string[]>();
        const pushedInstances = new Map<ModelConstructor, string[]>();
        const pushedDocuments = pendingUrls
            .filter((documentUrl) => pushedDocumentResources.has(documentUrl))
            .map((documentUrl) => {
                const resources = pushedDocumentResources.get(documentUrl) ?? new Map<string, Set<string>>();
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
                const documentUrls = pushedDocuments
                    .filter(({ rdfClasses }) => hasModelClasses(rdfClasses))
                    .map(({ documentUrl }) => documentUrl);

                if (documentUrls.length > 0) {
                    pushedModels.set(model.model, documentUrls);
                }

                continue;
            }

            const documentUrls: string[] = [];
            const instanceUrls: string[] = [];

            for (const { documentUrl, resources } of pushedDocuments) {
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
                pushedModels.set(model.model, documentUrls);
                pushedInstances.set(model.model, instanceUrls);
            }
        }

        return { pushedModels, pushedInstances };
    }

    private async pushRemoteDocument(
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

        const start = new Date();
        const response = await this.remoteEngine.updateDocument(remoteDocument.url, remoteUpdates);
        const end = new Date();
        const updatedRemoteDocument = applyOperationsToDocument(remoteMergeDocument, remoteUpdates);
        const updatedRemoteOperations = await this.getDocumentOperations(updatedRemoteDocument, resourceUrls);

        const lastModifiedAt = localDocument.url.endsWith('/')
            ? (this.getContainerLastModifiedAt(response) ?? this.getContainerLastModifiedAt(remoteDocument))
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

        await this.updateSyncedDocument(localDocument, localUpdates, {
            lastModifiedAt,
            pushedChanges: localChanges,
            resolvedUrls: new Set([...resolution.discardedLocalResources, ...resolution.restoredLocalResources]),
        });
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
                ? await this.getDeletionConflictResolution({
                      type: 'deleted-remotely',
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
                ? await this.getDeletionConflictResolution({
                      type: 'deleted-locally',
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

    private async getDeletionConflictResolution(conflict: DeletionConflict): Promise<DeletionConflictResolution> {
        const resolveDeletionConflict = this.config.resolveDeletionConflict;

        if (!resolveDeletionConflict) {
            return 'delete';
        }

        const answer = await this.conflictsSemaphore.run(() => resolveDeletionConflict(conflict));

        this.assertNotCancelled(this.getResult());

        return answer;
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

    private isNonRDFResource(containerDocument: SolidDocument, resourceUrl: string): boolean {
        if (resourceUrl.endsWith('/')) {
            return false;
        }

        const mediaTypeUrls = containerDocument
            .statements(resourceUrl, RDF_TYPE_PREDICATE)
            .map((statement) => statement.object.value)
            .filter((type) => type.startsWith(IANA_MEDIA_TYPE_PREFIX));

        if (mediaTypeUrls.length === 0) {
            return false;
        }

        return !mediaTypeUrls.some((type) => {
            const mediaType = type.slice(IANA_MEDIA_TYPE_PREFIX.length).replace(/#Resource$/, '');

            return RDF_MEDIA_TYPES.has(mediaType);
        });
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
