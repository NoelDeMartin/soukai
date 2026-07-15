import {
    Semaphore,
    arrayGroupBy,
    arrayUnique,
    isInstanceOf,
    isTruthy,
    objectFromEntries,
    parseDate,
    round,
} from '@noeldemartin/utils';
import { SolidDocument } from '@noeldemartin/solid-utils';
import type { SolidResponse, SolidUserProfile } from '@noeldemartin/solid-utils';

import Container from 'soukai-bis/models/ldp/Container';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import JobCancelledError from 'soukai-bis/errors/JobCancelledError';
import JobFailedError from 'soukai-bis/errors/JobFailedError';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import Job from 'soukai-bis/jobs/Job';
import { engineFulfillsContract } from 'soukai-bis/engines/utils';
import { safeContainerUrl } from 'soukai-bis/utils/urls';
import { getContainerName } from 'soukai-bis/models/utils';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import { LDP_CONTAINS_PREDICATE, RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import type Engine from 'soukai-bis/engines/Engine';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Resource from 'soukai-bis/models/ldp/Resource';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import type { JobListener, JobStatus } from 'soukai-bis/jobs/types';

import { syncContainerRegistration } from './concerns/sync-container-registration';
import { syncDocumentOperations } from './concerns/sync-document-operations';

const DEFAULT_MAX_ERRORS = 10;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_LAST_MODIFIED_TOLERANCE = 1000;

export interface SyncConfig {
    userProfile: SolidUserProfile;
    localEngine: Engine;
    remoteEngine: SolidEngine;
    typeIndexes: TypeIndex[];
    applicationModels: {
        model: ModelConstructor;
        registration: boolean | { path: string };
    }[];
    maxErrors?: number;
    concurrency?: number;
    lastModifiedTolerance?: number;
    createPrivateTypeIndex?(): Promise<TypeIndex>;
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

export interface SyncJobListener extends JobListener {
    onModelsRegistered?(typeIndex: TypeIndex, models: ModelConstructor[]): unknown;
    onFinished?(result: { syncedDocumentUrls: Set<string>; documentsWithErrors: Set<string> }): unknown;
}

export default class Sync extends Job<SyncJobListener, SyncJobStatus, SyncJobStatus> {

    public static async run(config: SyncConfig & SyncJobListener): Promise<void> {
        const job = new Sync(config);

        job.listeners.add({
            onModelsRegistered: (typeIndex, models) => config.onModelsRegistered?.(typeIndex, models),
            onFinished: (result) => config.onFinished?.(result),
            onUpdated: (progress) => config.onUpdated?.(progress),
        });

        await job.run();
    }

    public readonly documentsWithErrors = new Set<string>();
    public readonly syncedDocumentUrls = new Set<string>();
    private semaphore: Semaphore;
    private registeredContainers = new Map<string, Set<ModelConstructor>>();
    private documentsLastModifiedAt = new Map<string, Date | null>();
    private modelRegistrationPaths: Map<ModelConstructor, string>;
    private syncRdfClasses: Set<string>;
    private unsyncedContainers?: Set<string>;

    public constructor(private config: SyncConfig) {
        super();

        this.semaphore = new Semaphore(config.concurrency ?? DEFAULT_CONCURRENCY);
        this.modelRegistrationPaths = new Map(
            this.config.applicationModels
                .map((model) => {
                    const path =
                        typeof model.registration === 'object'
                            ? (model.registration.path ?? getContainerName(model.model.modelName))
                            : model.registration && getContainerName(model.model.modelName);

                    if (!path) {
                        return;
                    }

                    const storageUrl = this.config.userProfile.storageUrls[0].slice(0, -1);
                    const containerUrl = storageUrl + `/${path}/`.replace(/\/\//g, '/');

                    return [model.model, containerUrl] as const;
                })
                .filter(isTruthy),
        );
        this.syncRdfClasses = new Set(
            Array.from(this.config.applicationModels)
                .map((model) => model.model)
                .concat([Container])
                .map((model) => model.schema.rdfClasses.map((rdfClass) => rdfClass.value))
                .flat(),
        );
    }

    protected async run(): Promise<void> {
        await this.prepareDocumentsLastModifiedAt();
        await this.pullChanges();
        await this.pushChanges();
        await this.finish();
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

        if (!remoteUpdatedAt || !lastModifiedAt) {
            return false;
        }

        const localTimestamp = lastModifiedAt.getTime();
        const remoteTimestamp = remoteUpdatedAt.getTime();

        if (localTimestamp === remoteTimestamp) {
            return true;
        }

        const lastModifiedTolerance = this.config.lastModifiedTolerance ?? DEFAULT_LAST_MODIFIED_TOLERANCE;

        if (Math.abs(remoteTimestamp - localTimestamp) <= lastModifiedTolerance) {
            await this.config.localEngine.updateDocument(documentUrl, [], {
                lastModifiedAt: remoteUpdatedAt,
            });

            this.documentsLastModifiedAt.set(documentUrl, remoteUpdatedAt);

            return true;
        }

        return false;
    }

    private async prepareDocumentsLastModifiedAt(): Promise<void> {
        if (!engineFulfillsContract(this.config.localEngine, 'ManagesDocuments')) {
            return;
        }

        const documentsLastModifiedAt = await this.config.localEngine.getDocumentsLastModifiedAt();

        this.documentsLastModifiedAt = new Map(Object.entries(documentsLastModifiedAt));
    }

    private async prepareUnsyncedContainers(): Promise<void> {
        if (!engineFulfillsContract(this.config.localEngine, 'ManagesDocuments')) {
            return;
        }

        this.unsyncedContainers = new Set<string>();

        for (const [url, lastModifiedAt] of this.documentsLastModifiedAt) {
            if (lastModifiedAt !== null) {
                continue;
            }

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
        await this._listeners.emit('onFinished', {
            syncedDocumentUrls: this.syncedDocumentUrls,
            documentsWithErrors: this.documentsWithErrors,
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

    private async pullChanges(): Promise<void> {
        await this.initializeMatchingContainers();

        const containerUrls = Array.from(this.registeredContainers.keys());
        const pullStatus = this.status.children[0];

        pullStatus.children = containerUrls.map(() => ({ completed: false }));

        await this.pullContainerDocuments(containerUrls, pullStatus);
        await this.updateProgress((status) => (status.children[0].completed = true));
    }

    private async pullContainerDocuments(containerUrls: string[], pullStatus: JobStatus): Promise<void> {
        let ongoing = 0;
        let failed = false;

        const queue = containerUrls.map((containerUrl, index) => ({
            url: containerUrl,
            status: pullStatus.children?.[index],
        }));

        return new Promise<void>((resolve, reject) => {
            const next = () => {
                if (failed) {
                    return;
                }

                while (queue.length > 0 && this.semaphore.isAvailable()) {
                    const pullTask = queue.shift() as PullTask;

                    ongoing++;

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
            const childPullTasks = await this.semaphore.run(() => {
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
        await this.pushContainerDocuments(this.config.userProfile.storageUrls[0], this.status.children[1]);
        await this.updateProgress((status) => (status.children[1].completed = true));
    }

    private async initializeMatchingContainers(): Promise<void> {
        for (const typeIndex of this.config.typeIndexes) {
            const registrations = typeIndex.registrations ?? [];

            for (const registration of registrations) {
                if (!registration.instanceContainer) {
                    continue;
                }

                const containerRegisteredModels = this.config.applicationModels.filter((model) => {
                    return (
                        model.registration &&
                        model.model.schema.rdfClasses.some((rdfClass) => registration.forClass.includes(rdfClass.value))
                    );
                });

                if (containerRegisteredModels.length === 0) {
                    continue;
                }

                const containerRegistrations =
                    this.registeredContainers.get(registration.instanceContainer) ?? new Set();

                containerRegisteredModels.forEach((model) => containerRegistrations.add(model.model));

                this.registeredContainers.set(registration.instanceContainer, containerRegistrations);
            }
        }
    }

    private async syncDocument(documentUrl: string, status?: JobStatus, remoteUpdatedAt?: Date): Promise<PullTask[]> {
        this.assertNotCancelled();

        if (this.syncedDocumentUrls.has(documentUrl)) {
            return [];
        }

        this.syncedDocumentUrls.add(documentUrl);

        try {
            if (await this.skipDocumentPull(documentUrl, remoteUpdatedAt)) {
                return [];
            }

            const { remoteDocument, childrenPullTasks } = await this.syncRemoteChildren(documentUrl, status);
            const localDocument = await this.config.localEngine.readDocumentIfExists(documentUrl);

            if (!localDocument && remoteDocument) {
                if (!this.shouldPullDocument(remoteDocument)) {
                    return childrenPullTasks;
                }

                const lastModifiedAt = remoteDocument.url.endsWith('/')
                    ? this.getContainerLastModifiedAt(remoteDocument)
                    : remoteDocument.getLastModified();

                await this.config.localEngine.createDocument(documentUrl, remoteDocument.getQuads(), {
                    lastModifiedAt,
                });

                this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);

                return childrenPullTasks;
            }

            if (!remoteDocument || !localDocument) {
                return childrenPullTasks;
            }

            await this.syncDocumentContents(localDocument, remoteDocument);

            return childrenPullTasks;
        } catch (error) {
            if (!isInstanceOf(error, DocumentNotFound)) {
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

    private async syncRemoteChildren(
        documentUrl: string,
        status?: JobStatus,
    ): Promise<{ remoteDocument: SolidDocument | null; childrenPullTasks: PullTask[] }> {
        const remoteDocument = await this.config.remoteEngine.readDocumentIfExists(documentUrl);

        if (remoteDocument && documentUrl.endsWith('/')) {
            const container = await Container.createFromDocument(remoteDocument, { url: documentUrl });
            const resources = container?.resources ?? [];
            const resourcesByUrl = objectFromEntries(
                resources.map((document) => [document.url, document]).filter(([url]) => !!url) as [string, Resource][],
            );

            const resourceUrls = container?.resourceUrls ?? [];

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

    private async pushContainerDocuments(url: string, status?: JobStatus): Promise<void> {
        this.assertNotCancelled();

        if (this.unsyncedContainers && !this.unsyncedContainers.has(url)) {
            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }

            return;
        }

        try {
            const document = await this.config.localEngine.readDocumentIfExists(url);
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

            const pushedModels = await this.pushContainerChildrenDocuments(pendingUrls, status);

            await syncContainerRegistration({
                container,
                models: pushedModels,
                registeredContainers: this.registeredContainers,
                modelRegistrationPaths: this.modelRegistrationPaths,
                getTypeIndex: async () => {
                    return this.config.typeIndexes[0] ?? (await this.createPrivateTypeIndex());
                },
                onModelsRegistered: (typeIndex, registeredModels) => {
                    return this._listeners.emit('onModelsRegistered', typeIndex, registeredModels);
                },
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

    private async createPrivateTypeIndex(): Promise<TypeIndex> {
        const typeIndex = this.config.createPrivateTypeIndex
            ? await this.config.createPrivateTypeIndex()
            : await TypeIndex.createPrivate(this.config.userProfile);

        this.config.typeIndexes.push(typeIndex);

        return typeIndex;
    }

    private async pushContainerChildrenDocuments(
        pendingUrls: string[] = [],
        status?: JobStatus,
    ): Promise<Set<ModelConstructor>> {
        const rdfClasses = new Set<string>();
        const localDocuments = await this.config.localEngine.readDocuments({ urls: pendingUrls });

        await Promise.all(
            pendingUrls.map(async (documentUrl, index) => {
                const childStatus = status?.children?.[index];
                const localDocument = localDocuments[documentUrl];

                if (!localDocument || !!localDocument.getLastModified()) {
                    if (childStatus) {
                        await this.updateProgress(() => (childStatus.completed = true));
                    }

                    return;
                }

                try {
                    const start = new Date();
                    const remoteDocument = await this.pushRemoteDocument(localDocument);
                    const end = new Date();
                    const lastModifiedAt = remoteDocument.url.endsWith('/')
                        ? this.getContainerLastModifiedAt(remoteDocument)
                        : this.getDocumentLastModifiedAt(start, end, remoteDocument);

                    await this.config.localEngine.updateDocument(documentUrl, [], {
                        lastModifiedAt,
                    });

                    this.documentsLastModifiedAt.set(documentUrl, lastModifiedAt);

                    localDocument
                        .statements(undefined, RDF_TYPE_PREDICATE)
                        .map((quad) => quad.object.value)
                        .forEach((rdfClass) => rdfClasses.add(rdfClass));
                } catch (error) {
                    this.handleDocumentError(documentUrl, error);
                } finally {
                    if (childStatus) {
                        await this.updateProgress(() => (childStatus.completed = true));
                    }
                }
            }),
        );

        return new Set(
            this.config.applicationModels
                .filter((model) => {
                    return (
                        model.registration &&
                        model.model.schema.rdfClasses.some((rdfClass) => rdfClasses.has(rdfClass.value))
                    );
                })
                .map((model) => model.model),
        );
    }

    private async pushRemoteDocument(localDocument: SolidDocument): Promise<SolidDocument> {
        this.assertNotCancelled();

        this.syncedDocumentUrls.add(localDocument.url);

        try {
            const remoteDocument = await this.config.remoteEngine.createDocument(
                localDocument.url,
                localDocument.getQuads(),
            );

            return remoteDocument;
        } catch (error) {
            if (!(error instanceof DocumentAlreadyExists)) {
                throw error;
            }

            const remoteDocument = error.document ?? (await this.config.remoteEngine.readDocument(localDocument.url));

            await this.syncDocumentContents(localDocument, remoteDocument);

            return remoteDocument;
        }
    }

    private async syncDocumentContents(localDocument: SolidDocument, remoteDocument: SolidDocument): Promise<void> {
        this.assertNotCancelled();

        const resourceUrls = arrayUnique(
            [remoteDocument, localDocument].flatMap((document) =>
                document
                    .getQuads()
                    .filter(
                        (quad) =>
                            quad.predicate.equals(RDF_TYPE_PREDICATE) && this.syncRdfClasses.has(quad.object.value),
                    )
                    .map((quad) => quad.subject.value)),
        );
        const localOperations = await this.getDocumentOperations(localDocument, resourceUrls);
        const remoteOperations = await this.getDocumentOperations(remoteDocument, resourceUrls);

        const start = new Date();
        const response = await syncDocumentOperations({
            resourceUrls,
            document: remoteDocument,
            otherDocument: localDocument,
            engine: this.config.remoteEngine,
            existingOperations: Array.from(remoteOperations.values()),
            newOperations: Array.from(localOperations.values()).filter(
                (operation) => !remoteOperations.has(operation.url),
            ),
        });
        const end = new Date();

        const lastModifiedAt = localDocument.url.endsWith('/')
            ? (this.getContainerLastModifiedAt(response) ?? this.getContainerLastModifiedAt(remoteDocument))
            : this.getDocumentLastModifiedAt(start, end, response);

        await syncDocumentOperations({
            resourceUrls,
            document: localDocument,
            otherDocument: remoteDocument,
            engine: this.config.localEngine,
            existingOperations: Array.from(localOperations.values()),
            newOperations: Array.from(remoteOperations.values()).filter(
                (operation) => !localOperations.has(operation.url),
            ),
            metadata: {
                lastModifiedAt,
            },
        });

        this.documentsLastModifiedAt.set(localDocument.url, lastModifiedAt);
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

    private handleDocumentError(documentUrl: string, error: unknown): void {
        if (error instanceof JobCancelledError || error instanceof JobFailedError) {
            throw error;
        }

        const maxErrors = this.config.maxErrors ?? DEFAULT_MAX_ERRORS;

        this.documentsWithErrors.add(documentUrl);

        if (this.documentsWithErrors.size >= maxErrors) {
            throw new JobFailedError(`Too many errors during sync (${this.documentsWithErrors.size}).`);
        }
    }

}
