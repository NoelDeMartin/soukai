import Container from 'soukai-bis/models/Container';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import type Engine from 'soukai-bis/engines/Engine';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import { expandIRI } from '@noeldemartin/solid-utils';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/utils/rdf';
import type { Operation } from 'soukai-bis/models';
import { PropertyOperation, SetPropertyOperation, UnsetPropertyOperation } from 'soukai-bis/models';
import { isInstanceOf, objectFromEntries, required } from '@noeldemartin/utils';

export interface SyncConfig {
    localEngine: Engine;
    remoteEngine: Engine;
    storageUrl: string;
    typeIndexes: TypeIndex[];
    registeredModels: ModelConstructor[];
}

export default class Sync {

    public static async run(config: SyncConfig): Promise<void> {
        const job = new Sync(config);

        await job.sync();
    }

    private visitedDocumentUrls = new Set<string>();

    private constructor(private config: SyncConfig) {}

    private async sync(): Promise<void> {
        await this.pullChanges();
        await this.pushChanges();
    }

    private async getMatchingContainers(): Promise<Map<string, Set<ModelConstructor>>> {
        const matchingContainers = new Map<string, Set<ModelConstructor>>();

        for (const typeIndex of this.config.typeIndexes) {
            const registrations = typeIndex.registrations ?? [];

            for (const registration of registrations) {
                if (!registration.instanceContainer) {
                    continue;
                }

                const containerRegisteredModels = this.config.registeredModels.filter((model) => {
                    return model.schema.rdfClasses.some((rdfClass) => registration.forClass.includes(rdfClass.value));
                });

                if (containerRegisteredModels.length === 0) {
                    continue;
                }

                const containerRegistrations = matchingContainers.get(registration.instanceContainer) ?? new Set();

                containerRegisteredModels.forEach((model) => containerRegistrations.add(model));
                matchingContainers.set(registration.instanceContainer, containerRegistrations);
            }
        }

        return matchingContainers;
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
        const containers = await this.getMatchingContainers();

        for (const [containerUrl, models] of containers) {
            await this.syncDocument(containerUrl, models);
        }
    }

    private async pushChanges(): Promise<void> {
        await this.pushContainer(this.config.storageUrl);
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

            await this.syncDocumentOperations(localDocument, remoteDocument, models);
        } catch (error) {
            if (error instanceof DocumentNotFound) {
                return;
            }

            throw error;
        }
    }

    private async pushContainer(url: string): Promise<void> {
        const document = await this.config.localEngine.readDocumentIfExists(url);
        const container = document && (await Container.createFromDocument(document, { url }));

        if (!container) {
            return;
        }

        for (const childDocumentUrl of container.resourceUrls) {
            if (childDocumentUrl.endsWith('/')) {
                await this.pushContainer(childDocumentUrl);

                continue;
            }

            if (this.visitedDocumentUrls.has(childDocumentUrl)) {
                continue;
            }

            const localDocument = await this.config.localEngine.readDocument(childDocumentUrl);

            await this.config.remoteEngine.createDocument(childDocumentUrl, localDocument.getQuads());
        }
    }

    private async syncDocumentOperations(
        localDocument: SolidDocument,
        remoteDocument: SolidDocument,
        models: Set<ModelConstructor>,
    ): Promise<void> {
        const modelClasses = Array.from(models)
            .map((model) => model.schema.rdfClasses.map((rdfClass) => rdfClass.value))
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
                    property: expandIRI('crdt:updatedAt'),
                    value: [date],
                    date,
                }),
            );
        }

        await engine.updateDocument(document.url, documentOperations);
    }

}
