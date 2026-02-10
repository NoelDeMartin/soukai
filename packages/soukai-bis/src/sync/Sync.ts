import { arrayGroupBy, isInstanceOf, objectFromEntries, required } from '@noeldemartin/utils';
import type { SolidDocument, SolidUserProfile } from '@noeldemartin/solid-utils';

import Container from 'soukai-bis/models/Container';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import { PropertyOperation, SetPropertyOperation, UnsetPropertyOperation } from 'soukai-bis/models';
import { CRDT_UPDATED_AT, CRDT_UPDATED_AT_PREDICATE, RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import { safeContainerUrl } from 'soukai-bis/utils/urls';
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

    private constructor(private config: SyncConfig) {}

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

    private async getMetadataUpdates(
        document: SolidDocument,
        newOperations: Operation[],
    ): Promise<Record<string, Date>> {
        const metadataInstances = await Metadata.createManyFromDocument(document);
        const metadataUpdates = new Map(
            metadataInstances.map((instance) => [
                required(instance.resourceUrl),
                { metadataUrl: instance.url, date: required(instance.updatedAt), updated: false },
            ]),
        );

        for (const operation of newOperations) {
            const metadata = metadataUpdates.get(operation.resourceUrl);

            if (!metadata || operation.date <= metadata.date) {
                continue;
            }

            metadata.date = operation.date;
            metadata.updated = true;
        }

        return objectFromEntries(
            Array.from(metadataUpdates.values())
                .filter(({ updated }) => updated)
                .map(({ metadataUrl, date }) => [metadataUrl, date]),
        );
    }

    private async pullChanges(): Promise<void> {
        await this.initializeMatchingContainers();

        for (const [containerUrl, models] of this.registeredContainers) {
            await this.syncDocument(containerUrl, models);
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

    private async syncDocument(documentUrl: string, models: Set<ModelConstructor>): Promise<void> {
        this.visitedDocumentUrls.add(documentUrl);

        try {
            const remoteDocument = await this.config.remoteEngine.readDocumentIfExists(documentUrl);
            const localDocument = await this.config.localEngine.readDocumentIfExists(documentUrl);

            if (remoteDocument && documentUrl.endsWith('/')) {
                const container = await Container.createFromDocument(remoteDocument, { url: documentUrl });

                for (const childDocumentUrl of container?.resourceUrls ?? []) {
                    await this.syncDocument(childDocumentUrl, models);
                }
            }

            if (!localDocument && remoteDocument && !documentUrl.endsWith('/')) {
                await this.config.localEngine.createDocument(documentUrl, remoteDocument.getQuads());

                return;
            }

            if (!remoteDocument || !localDocument) {
                return;
            }

            await this.syncDocumentOperations(localDocument, remoteDocument);
        } catch (error) {
            if (error instanceof DocumentNotFound) {
                return;
            }

            throw error;
        }
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

            await this.config.remoteEngine.createDocument(documentUrl, localDocument.getQuads());

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

    private async syncDocumentOperations(localDocument: SolidDocument, remoteDocument: SolidDocument): Promise<void> {
        const modelClasses = Array.from(this.config.applicationModels)
            .map((model) => model.model.schema.rdfClasses.map((rdfClass) => rdfClass.value))
            .flat();
        const resourceUrls = remoteDocument
            .getQuads()
            .filter((quad) => quad.predicate.equals(RDF_TYPE_PREDICATE) && modelClasses.includes(quad.object.value))
            .map((quad) => quad.subject.value);
        const localOperations = await this.getDocumentOperations(localDocument, resourceUrls);
        const remoteOperations = await this.getDocumentOperations(remoteDocument, resourceUrls);

        await this.updateDocument({
            document: localDocument,
            engine: this.config.localEngine,
            existingOperations: Array.from(localOperations.values()),
            newOperations: Array.from(remoteOperations.values()).filter(
                (operation) => !localOperations.has(operation.url),
            ),
        });

        await this.updateDocument({
            document: remoteDocument,
            engine: this.config.remoteEngine,
            existingOperations: Array.from(remoteOperations.values()),
            newOperations: Array.from(localOperations.values()).filter(
                (operation) => !remoteOperations.has(operation.url),
            ),
        });
    }

    private async updateDocument({
        document,
        engine,
        existingOperations,
        newOperations,
    }: {
        document: SolidDocument;
        engine: Engine;
        existingOperations: Operation[];
        newOperations: Operation[];
    }): Promise<void> {
        if (newOperations.length === 0) {
            return;
        }

        const documentOperations = this.getDocumentUpdateOperations({ existingOperations, newOperations });
        const metadataUpdates = await this.getMetadataUpdates(document, newOperations);

        for (const [resourceUrl, date] of Object.entries(metadataUpdates)) {
            documentOperations.push(
                new SetPropertyOperation({
                    resourceUrl,
                    property: CRDT_UPDATED_AT,
                    value: [date],
                    date,
                }).setPredicate(CRDT_UPDATED_AT_PREDICATE),
            );
        }

        await engine.updateDocument(document.url, documentOperations);
    }

}
