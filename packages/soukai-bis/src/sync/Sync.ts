import { arrayGroupBy, isInstanceOf, objectFromEntries, parseDate, required } from '@noeldemartin/utils';
import type { SolidDocument, SolidUserProfile } from '@noeldemartin/solid-utils';

import Container from 'soukai-bis/models/ldp/Container';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import { PropertyOperation, SetPropertyOperation, UnsetPropertyOperation } from 'soukai-bis/models';
import {
    CRDT_CREATED_AT,
    CRDT_CREATED_AT_PREDICATE,
    CRDT_METADATA,
    CRDT_METADATA_OBJECT,
    CRDT_RESOURCE,
    CRDT_RESOURCE_PREDICATE,
    CRDT_UPDATED_AT,
    CRDT_UPDATED_AT_PREDICATE,
    LDP_CONTAINS_PREDICATE,
    RDF_TYPE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';
import { safeContainerUrl } from 'soukai-bis/utils/urls';
import type Resource from 'soukai-bis/models/ldp/Resource';
import type Engine from 'soukai-bis/engines/Engine';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

export interface SyncConfig {
    userProfile: SolidUserProfile;
    localEngine: Engine;
    remoteEngine: SolidEngine;
    typeIndexes: TypeIndex[];
    applicationModels: {
        model: ModelConstructor;
        registered: boolean;
    }[];
    onModelsRegistered?(typeIndex: TypeIndex, models: ModelConstructor[]): unknown;
}

export default class Sync {

    public static async run(config: SyncConfig): Promise<void> {
        const job = new Sync(config);

        await job.sync();
    }

    private visitedDocumentUrls = new Set<string>();
    private registeredContainers = new Map<string, Set<ModelConstructor>>();
    private syncRdfClasses: Set<string>;

    private constructor(private config: SyncConfig) {
        this.syncRdfClasses = new Set(
            Array.from(this.config.applicationModels)
                .map((model) => model.model)
                .concat([Container])
                .map((model) => model.schema.rdfClasses.map((rdfClass) => rdfClass.value))
                .flat(),
        );
    }

    private async sync(): Promise<void> {
        await this.pullChanges();
        await this.pushChanges();
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

    private getDocumentUpdateOperations({
        existingOperations,
        newOperations,
    }: {
        existingOperations: Operation[];
        newOperations: Operation[];
    }): Operation[] {
        const operations: Operation[] = [];
        const existingPropertyOperations = existingOperations.filter(
            (operation) => operation instanceof PropertyOperation,
        );

        for (const newOperation of newOperations) {
            operations.push(...newOperation.createDocumentOperations());

            if (
                isInstanceOf(newOperation, PropertyOperation) &&
                existingPropertyOperations.some(
                    (existingOperation) =>
                        existingOperation.resourceUrl === newOperation.resourceUrl &&
                        existingOperation.property === newOperation.property &&
                        existingOperation.date > newOperation.date,
                )
            ) {
                continue;
            }

            operations.push(newOperation);
        }

        return operations;
    }

    private async getMetadataUpdates({
        document,
        otherDocument,
        newOperations,
    }: {
        document: SolidDocument;
        otherDocument: SolidDocument;
        newOperations: Operation[];
    }): Promise<Record<string, { exists: boolean; url: string; createdAt: Date; updatedAt: Date }>> {
        const metadataInstances = await Metadata.createManyFromDocument(document);
        const otherMetadataInstances = await Metadata.createManyFromDocument(otherDocument);
        const otherMetadataByResource = objectFromEntries(
            otherMetadataInstances.map((instance) => [required(instance.resourceUrl), instance]),
        );
        const metadataUpdates = new Map(
            metadataInstances.map((instance) => [
                required(instance.resourceUrl),
                {
                    exists: true,
                    updated: false,
                    url: instance.url,
                    resourceUrl: required(instance.resourceUrl),
                    createdAt: required(instance.createdAt),
                    updatedAt: required(instance.updatedAt),
                },
            ]),
        );

        for (const operation of newOperations) {
            const metadata = metadataUpdates.get(operation.resourceUrl);

            if (!metadata) {
                const otherMetadata = otherMetadataByResource[operation.resourceUrl];

                if (otherMetadata) {
                    metadataUpdates.set(operation.resourceUrl, {
                        exists: false,
                        updated: true,
                        url: otherMetadata.url,
                        resourceUrl: operation.resourceUrl,
                        createdAt: operation.date,
                        updatedAt: operation.date,
                    });
                }

                continue;
            }

            if (operation.date < metadata.createdAt) {
                metadata.createdAt = operation.date;
                metadata.updated = true;
            }

            if (operation.date > metadata.updatedAt) {
                metadata.updatedAt = operation.date;
                metadata.updated = true;
            }
        }

        return objectFromEntries(
            Array.from(metadataUpdates.values())
                .filter(({ updated }) => updated)
                .map(({ exists, url, resourceUrl, createdAt, updatedAt }) => {
                    return [resourceUrl, { exists, url, createdAt, updatedAt }];
                }),
        );
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

        for (const containerUrl of this.registeredContainers.keys()) {
            await this.syncDocument(containerUrl);
        }
    }

    private async pushChanges(): Promise<void> {
        await this.pushContainerDocuments(this.config.userProfile.storageUrls[0]);
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
                        model.registered &&
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

    private async syncDocument(documentUrl: string, remoteUpdatedAt?: Date): Promise<void> {
        this.visitedDocumentUrls.add(documentUrl);

        try {
            if (await this.skipDocumentPull(documentUrl, remoteUpdatedAt)) {
                return;
            }

            const remoteDocument = await this.syncRemoteChildren(documentUrl);
            const localDocument = await this.config.localEngine.readDocumentIfExists(documentUrl);

            if (!localDocument && remoteDocument) {
                if (!this.shouldPullDocument(remoteDocument)) {
                    return;
                }

                await this.config.localEngine.createDocument(documentUrl, remoteDocument.getQuads(), {
                    lastModifiedAt: remoteDocument.getLastModified() ?? undefined,
                });

                return;
            }

            if (!remoteDocument || !localDocument) {
                return;
            }

            await this.syncDocumentMetadata(localDocument, remoteDocument);
            await this.syncDocumentOperations(localDocument, remoteDocument);
        } catch (error) {
            if (error instanceof DocumentNotFound) {
                return;
            }

            throw error;
        }
    }

    private async syncRemoteChildren(documentUrl: string): Promise<SolidDocument | null> {
        const remoteDocument = await this.config.remoteEngine.readDocumentIfExists(documentUrl);

        if (remoteDocument && documentUrl.endsWith('/')) {
            const container = await Container.createFromDocument(remoteDocument, { url: documentUrl });
            const resources = container?.resources ?? [];
            const resourcesByUrl = objectFromEntries(
                resources.map((document) => [document.url, document]).filter(([url]) => !!url) as [string, Resource][],
            );

            for (const childDocumentUrl of container?.resourceUrls ?? []) {
                const childResource = resourcesByUrl[childDocumentUrl];

                await this.syncDocument(childDocumentUrl, childResource?.updatedAt);
            }
        }

        return remoteDocument;
    }

    private async pushContainerDocuments(url: string): Promise<void> {
        const document = await this.config.localEngine.readDocumentIfExists(url);
        const container = document && (await Container.createFromDocument(document, { url }));

        if (!container) {
            return;
        }

        const { containerChildren, documentChildren } = arrayGroupBy(container.resourceUrls, (childUrl) => {
            return childUrl.endsWith('/') ? 'containerChildren' : 'documentChildren';
        });

        const pushedModels = await this.pushContainerChildrenDocuments(documentChildren ?? []);

        await this.syncContainerRegistration(container, pushedModels);

        for (const containerUrl of containerChildren ?? []) {
            await this.pushContainerDocuments(containerUrl);

            continue;
        }
    }

    private async pushContainerChildrenDocuments(urls: string[] = []): Promise<Set<ModelConstructor>> {
        const rdfClasses = new Set<string>();

        for (const documentUrl of urls) {
            if (this.visitedDocumentUrls.has(documentUrl)) {
                continue;
            }

            const localDocument = await this.config.localEngine.readDocument(documentUrl);
            const remoteDocument = await this.config.remoteEngine.createDocument(documentUrl, localDocument.getQuads());
            const lastModifiedAt = parseDate(
                remoteDocument.headers.get('Date') || remoteDocument.headers.get('Last-Modified'),
            );

            if (lastModifiedAt) {
                await this.config.localEngine.updateDocument(documentUrl, [], { lastModifiedAt });
            }

            localDocument
                .statements(undefined, RDF_TYPE_PREDICATE)
                .map((quad) => quad.object.value)
                .forEach((rdfClass) => rdfClasses.add(rdfClass));
        }

        return new Set(
            this.config.applicationModels
                .filter((model) => {
                    return (
                        model.registered &&
                        model.model.schema.rdfClasses.some((rdfClass) => rdfClasses.has(rdfClass.value))
                    );
                })
                .map((model) => model.model),
        );
    }

    private async syncContainerRegistration(
        container: ModelWithUrl<Container>,
        models: Set<ModelConstructor>,
    ): Promise<void> {
        let containerUrl: string | null = container.url;

        while (containerUrl) {
            this.registeredContainers.get(containerUrl)?.forEach((model) => models.delete(model));

            containerUrl = safeContainerUrl(containerUrl);

            if (models.size === 0) {
                return;
            }
        }

        const typeIndex = this.config.typeIndexes[0] ?? (await TypeIndex.createPrivate(this.config.userProfile));

        await container.register(typeIndex, Array.from(models));
        await this.config.onModelsRegistered?.(typeIndex, Array.from(models));
    }

    private async syncDocumentMetadata(localDocument: SolidDocument, remoteDocument: SolidDocument): Promise<void> {
        const lastModifiedAt = remoteDocument.getLastModified();

        if (!lastModifiedAt) {
            return;
        }

        await this.config.localEngine.updateDocument(localDocument.url, [], { lastModifiedAt });
    }

    private async syncDocumentOperations(localDocument: SolidDocument, remoteDocument: SolidDocument): Promise<void> {
        const resourceUrls = remoteDocument
            .getQuads()
            .filter((quad) => quad.predicate.equals(RDF_TYPE_PREDICATE) && this.syncRdfClasses.has(quad.object.value))
            .map((quad) => quad.subject.value);
        const localOperations = await this.getDocumentOperations(localDocument, resourceUrls);
        const remoteOperations = await this.getDocumentOperations(remoteDocument, resourceUrls);

        await this.updateDocument({
            document: localDocument,
            otherDocument: remoteDocument,
            engine: this.config.localEngine,
            existingOperations: Array.from(localOperations.values()),
            newOperations: Array.from(remoteOperations.values()).filter(
                (operation) => !localOperations.has(operation.url),
            ),
        });

        await this.updateDocument({
            document: remoteDocument,
            otherDocument: localDocument,
            engine: this.config.remoteEngine,
            existingOperations: Array.from(remoteOperations.values()),
            newOperations: Array.from(localOperations.values()).filter(
                (operation) => !remoteOperations.has(operation.url),
            ),
        });
    }

    private async updateDocument({
        document,
        otherDocument,
        engine,
        existingOperations,
        newOperations,
    }: {
        document: SolidDocument;
        otherDocument: SolidDocument;
        engine: Engine;
        existingOperations: Operation[];
        newOperations: Operation[];
    }): Promise<void> {
        if (newOperations.length === 0) {
            return;
        }

        const documentOperations = this.getDocumentUpdateOperations({ existingOperations, newOperations });
        const metadataUpdates = await this.getMetadataUpdates({ document, otherDocument, newOperations });

        for (const [resourceUrl, metadata] of Object.entries(metadataUpdates)) {
            if (!metadata.exists) {
                documentOperations.push(
                    new SetPropertyOperation({
                        resourceUrl: metadata.url,
                        property: RDF_TYPE,
                        value: [CRDT_METADATA],
                        date: metadata.updatedAt,
                    })
                        .setNamedNode(true)
                        .setPredicate(RDF_TYPE_PREDICATE)
                        .setValues([CRDT_METADATA_OBJECT]),
                );
                documentOperations.push(
                    new SetPropertyOperation({
                        resourceUrl: metadata.url,
                        property: CRDT_RESOURCE,
                        value: [resourceUrl],
                        date: metadata.updatedAt,
                    })
                        .setNamedNode(true)
                        .setPredicate(CRDT_RESOURCE_PREDICATE),
                );
                documentOperations.push(
                    new SetPropertyOperation({
                        resourceUrl: metadata.url,
                        property: CRDT_CREATED_AT,
                        value: [metadata.updatedAt],
                        date: metadata.updatedAt,
                    }).setPredicate(CRDT_CREATED_AT_PREDICATE),
                );
                documentOperations.push(
                    new SetPropertyOperation({
                        resourceUrl: metadata.url,
                        property: CRDT_UPDATED_AT,
                        value: [metadata.updatedAt],
                        date: metadata.updatedAt,
                    }).setPredicate(CRDT_UPDATED_AT_PREDICATE),
                );

                continue;
            }

            documentOperations.push(
                new SetPropertyOperation({
                    resourceUrl: metadata.url,
                    property: CRDT_UPDATED_AT,
                    value: [metadata.updatedAt],
                    date: metadata.updatedAt,
                }).setPredicate(CRDT_UPDATED_AT_PREDICATE),
            );
        }

        await engine.updateDocument(
            document.url,
            documentOperations,
            engine === this.config.localEngine
                ? { lastModifiedAt: otherDocument.getLastModified() ?? undefined }
                : undefined,
        );
    }

}
