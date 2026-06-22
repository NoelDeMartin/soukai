import { arrayGroupBy, arrayUnique, isTruthy, objectFromEntries, parseDate, round } from '@noeldemartin/utils';
import { SolidDocument } from '@noeldemartin/solid-utils';
import type { SolidResponse, SolidUserProfile } from '@noeldemartin/solid-utils';

import Container from 'soukai-bis/models/ldp/Container';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';
import Job from 'soukai-bis/jobs/Job';
import { SetPropertyOperation, UnsetPropertyOperation, getContainerName } from 'soukai-bis/models';
import { LDP_CONTAINS_PREDICATE, RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import type Engine from 'soukai-bis/engines/Engine';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type Resource from 'soukai-bis/models/ldp/Resource';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import type { JobListener, JobStatus } from 'soukai-bis/jobs/types';

import { syncContainerRegistration } from './concerns/sync-container-registration';
import { syncDocumentOperations } from './concerns/sync-document-operations';

export interface SyncConfig {
    userProfile: SolidUserProfile;
    localEngine: Engine;
    remoteEngine: SolidEngine;
    typeIndexes: TypeIndex[];
    applicationModels: {
        model: ModelConstructor;
        registration: boolean | { path: string };
    }[];
}

export interface SyncJobStatus extends JobStatus {
    root?: boolean;
    children: [JobStatus, JobStatus];
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
    private registeredContainers = new Map<string, Set<ModelConstructor>>();
    private modelRegistrationPaths: Map<ModelConstructor, string>;
    private syncRdfClasses: Set<string>;

    public constructor(private config: SyncConfig) {
        super();

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
        await this.pullChanges();
        await this.pushChanges();
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
        const allOperations = await Promise.all([
            SetPropertyOperation.createManyFromDocument(document),
            UnsetPropertyOperation.createManyFromDocument(document),
        ]);

        const operations = allOperations.flat().filter((operation) => resourceUrls.includes(operation.resourceUrl));

        return new Map(operations.map((operation) => [operation.url, operation]));
    }

    private async skipDocumentPull(documentUrl: string, remoteUpdatedAt?: Date): Promise<boolean> {
        const localDocument = await this.config.localEngine.readDocumentIfExists(documentUrl);

        return !!(
            localDocument &&
            remoteUpdatedAt &&
            localDocument.getLastModified()?.getTime() === remoteUpdatedAt.getTime()
        );
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

        const containers = Array.from(this.registeredContainers.keys());
        const pullStatus = this.status.children[0];

        pullStatus.children = containers.map(() => ({ completed: false }));

        await Promise.all(
            containers.map((containerUrl, index) => {
                const childStatus = pullStatus.children?.[index];

                return this.syncDocument(containerUrl, childStatus);
            }),
        );

        await this.updateProgress((status) => (status.children[0].completed = true));
    }

    private async pushChanges(): Promise<void> {
        const pushStatus = this.status.children[1];

        await this.pushContainerDocuments(this.config.userProfile.storageUrls[0], pushStatus);
        await this.updateProgress((status) => (status.children[1].completed = true));
        await ComputedAttributesCache.invalidate(Array.from(this.syncedDocumentUrls));
        await this._listeners.emit('onFinished', {
            syncedDocumentUrls: this.syncedDocumentUrls,
            documentsWithErrors: this.documentsWithErrors,
        });
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

    private async syncDocument(documentUrl: string, status?: JobStatus, remoteUpdatedAt?: Date): Promise<void> {
        this.assertNotCancelled();

        this.syncedDocumentUrls.add(documentUrl);

        try {
            if (await this.skipDocumentPull(documentUrl, remoteUpdatedAt)) {
                if (status) {
                    await this.updateProgress(() => (status.completed = true));
                }

                return;
            }

            const remoteDocument = await this.syncRemoteChildren(documentUrl, status);
            const localDocument = await this.config.localEngine.readDocumentIfExists(documentUrl);

            if (!localDocument && remoteDocument) {
                if (!this.shouldPullDocument(remoteDocument)) {
                    if (status) {
                        await this.updateProgress(() => (status.completed = true));
                    }

                    return;
                }

                await this.config.localEngine.createDocument(documentUrl, remoteDocument.getQuads(), {
                    lastModifiedAt: remoteDocument.url.endsWith('/')
                        ? this.getContainerLastModifiedAt(remoteDocument)
                        : (remoteDocument.getLastModified() ?? undefined),
                });

                if (status) {
                    await this.updateProgress(() => (status.completed = true));
                }

                return;
            }

            if (!remoteDocument || !localDocument) {
                if (status) {
                    await this.updateProgress(() => (status.completed = true));
                }

                return;
            }

            await this.syncDocumentContents(localDocument, remoteDocument);

            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }
        } catch (error) {
            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }

            if (error instanceof DocumentNotFound) {
                return;
            }

            throw error;
        }
    }

    private async syncRemoteChildren(documentUrl: string, status?: JobStatus): Promise<SolidDocument | null> {
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

            await Promise.all(
                resourceUrls.map((childDocumentUrl, index) => {
                    const childResource = resourcesByUrl[childDocumentUrl];
                    const childStatus = status?.children?.[index];

                    return this.syncDocument(
                        childDocumentUrl,
                        childStatus,
                        childDocumentUrl.endsWith('/') ? childResource?.deepUpdatedAt : childResource?.updatedAt,
                    );
                }),
            );
        }

        return remoteDocument;
    }

    private async pushContainerDocuments(url: string, status?: JobStatus): Promise<void> {
        this.assertNotCancelled();

        const document = await this.config.localEngine.readDocumentIfExists(url);
        const container = document && (await Container.createFromDocument(document, { url }));

        if (!container) {
            if (status) {
                await this.updateProgress(() => (status.completed = true));
            }

            return;
        }

        const { containerChildren, documentChildren } = arrayGroupBy(container.resourceUrls, (childUrl) => {
            return childUrl.endsWith('/') ? 'containerChildren' : 'documentChildren';
        });

        const pendingUrls = (documentChildren ?? []).filter((pendingUrl) => !this.syncedDocumentUrls.has(pendingUrl));
        const allChildrenUrls = pendingUrls.concat(containerChildren ?? []);

        if (status && allChildrenUrls.length > 0) {
            status.children = allChildrenUrls.map(() => ({ completed: false }));

            await this.updateProgress();
        }

        const pushedModels = await this.pushContainerChildrenDocuments(documentChildren ?? [], status);

        await syncContainerRegistration({
            container,
            models: pushedModels,
            registeredContainers: this.registeredContainers,
            modelRegistrationPaths: this.modelRegistrationPaths,
            getTypeIndex: async () => {
                return this.config.typeIndexes[0] ?? (await TypeIndex.createPrivate(this.config.userProfile));
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

        if (status) {
            await this.updateProgress(() => (status.completed = true));
        }
    }

    private async pushContainerChildrenDocuments(
        urls: string[] = [],
        status?: JobStatus,
    ): Promise<Set<ModelConstructor>> {
        const rdfClasses = new Set<string>();
        const pendingUrls = urls.filter((url) => !this.syncedDocumentUrls.has(url));
        const localDocuments = await this.config.localEngine.readDocuments(pendingUrls);

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

                const start = new Date();
                const remoteDocument = await this.pushRemoteDocument(localDocument);
                const end = new Date();

                await this.config.localEngine.updateDocument(documentUrl, [], {
                    lastModifiedAt: remoteDocument.url.endsWith('/')
                        ? this.getContainerLastModifiedAt(remoteDocument)
                        : this.getDocumentLastModifiedAt(start, end, remoteDocument),
                });

                localDocument
                    .statements(undefined, RDF_TYPE_PREDICATE)
                    .map((quad) => quad.object.value)
                    .forEach((rdfClass) => rdfClasses.add(rdfClass));

                if (childStatus) {
                    await this.updateProgress(() => (childStatus.completed = true));
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
                lastModifiedAt: localDocument.url.endsWith('/')
                    ? (this.getContainerLastModifiedAt(response) ?? this.getContainerLastModifiedAt(remoteDocument))
                    : this.getDocumentLastModifiedAt(start, end, response),
            },
        });
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
        const lastModifiedAt = remoteDocument?.headers.get('deep-last-modified');

        return lastModifiedAt ? parseDate(lastModifiedAt) : null;
    }

}
