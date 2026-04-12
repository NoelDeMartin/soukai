import { isInstanceOf, objectFromEntries, required } from '@noeldemartin/utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';

import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import Tombstone from 'soukai-bis/models/crdts/Tombstone';
import { createModelInceptionOperations } from 'soukai-bis/models/concerns/crdts';
import {
    CRDT_METADATA_OBJECT,
    CRDT_RESOURCE_PREDICATE,
    CRDT_SET_PROPERTY_OPERATION_OBJECT,
    CRDT_UNSET_PROPERTY_OPERATION_OBJECT,
    CRDT_UPDATED_AT,
    CRDT_UPDATED_AT_PREDICATE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';
import type Engine from 'soukai-bis/engines/Engine';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type { ModelWithUrl } from 'soukai-bis/models/types';

function getMetadataUpdates({
    documentMetadatas,
    otherDocumentMetadatas,
    newOperations,
}: {
    documentMetadatas: ModelWithUrl<Metadata>[];
    otherDocumentMetadatas: ModelWithUrl<Metadata>[];
    newOperations: Operation[];
}): Record<string, { exists: boolean; url: string; createdAt: Date; updatedAt: Date }> {
    const otherMetadataByResource = objectFromEntries(
        otherDocumentMetadatas.map((instance) => [required(instance.resourceUrl), instance]),
    );
    const metadataUpdates = new Map(
        documentMetadatas.map((instance) => [
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

function getDocumentUpdateOperations({
    existingOperations,
    newOperations,
}: {
    existingOperations: Operation[];
    newOperations: Operation[];
}): EngineOperation[] {
    const operations: Operation[] = [];
    const existingPropertyOperations = existingOperations.filter((operation) => operation instanceof PropertyOperation);

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

function getNewDocumentOperations({
    documentMetadatas,
    otherDocumentMetadatas,
    existingOperations,
    newOperations,
}: {
    documentMetadatas: ModelWithUrl<Metadata>[];
    otherDocumentMetadatas: ModelWithUrl<Metadata>[];
    existingOperations: Operation[];
    newOperations: Operation[];
}): EngineOperation[] {
    const documentOperations = getDocumentUpdateOperations({ existingOperations, newOperations });
    const metadataUpdates = getMetadataUpdates({ documentMetadatas, otherDocumentMetadatas, newOperations });

    for (const [resourceUrl, metadata] of Object.entries(metadataUpdates)) {
        if (!metadata.exists) {
            const instance = new Metadata({
                url: metadata.url,
                resourceUrl: resourceUrl,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
            }) as ModelWithUrl<Metadata>;

            instance.cleanDirty();
            documentOperations.push(...createModelInceptionOperations(instance, metadata.createdAt));

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

    return documentOperations;
}

function getNewResourcesDocumentOperations({
    otherDocument,
    newResourceUrls,
}: {
    otherDocument: SolidDocument;
    newResourceUrls: string[];
}): EngineOperation[] {
    const documentOperations: EngineOperation[] = [];

    for (const resourceUrl of newResourceUrls) {
        const quads = [
            ...otherDocument.statements(resourceUrl),
            ...otherDocument
                .statements(undefined, CRDT_RESOURCE_PREDICATE, resourceUrl)
                .map((quad) =>
                    otherDocument.statement(quad.subject.value, RDF_TYPE_PREDICATE, CRDT_METADATA_OBJECT)
                        ? otherDocument.statements(quad.subject.value)
                        : [])
                .flat(),
        ];

        for (const quad of quads) {
            documentOperations.push(
                new SetPropertyOperation({
                    resourceUrl: quad.subject.value,
                    property: quad.predicate.value,
                    value: [quad.object.value],
                    date: new Date(),
                })
                    .setNamedNode(quad.object.termType === 'NamedNode')
                    .setSubject(quad.subject)
                    .setPredicate(quad.predicate)
                    .setValues([quad.object]),
            );
        }
    }

    return documentOperations;
}

function getDeletedResourcesDocumentOperations({
    document,
    documentMetadatas,
    otherDocumentTombstones,
    deletedResourceUrls,
}: {
    document: SolidDocument;
    documentMetadatas: ModelWithUrl<Metadata>[];
    otherDocumentTombstones: ModelWithUrl<Tombstone>[];
    deletedResourceUrls: string[];
}): EngineOperation[] {
    const documentOperations: EngineOperation[] = [];
    const createdTombstones = otherDocumentTombstones.filter((tombstone) =>
        deletedResourceUrls.includes(tombstone.resourceUrl));
    const deletedMetadatas = documentMetadatas.filter(
        (metadata) => metadata.resourceUrl && deletedResourceUrls.includes(metadata.resourceUrl),
    );
    const deletedOperationUrls = [
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_SET_PROPERTY_OPERATION_OBJECT),
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_UNSET_PROPERTY_OPERATION_OBJECT),
    ]
        .filter((quad) =>
            deletedResourceUrls.some((resourceUrl) =>
                document.contains(quad.subject, CRDT_RESOURCE_PREDICATE, resourceUrl)))
        .map((quad) => quad.subject.value);

    for (const tombstone of createdTombstones) {
        documentOperations.push(...createModelInceptionOperations(tombstone, tombstone.deletedAt));
    }

    for (const metadata of deletedMetadatas) {
        documentOperations.push(new DeleteResourceOperation(metadata.url));
    }

    for (const operationUrl of deletedOperationUrls) {
        documentOperations.push(new DeleteResourceOperation(operationUrl));
    }

    for (const resourceUrl of deletedResourceUrls) {
        documentOperations.push(new DeleteResourceOperation(resourceUrl));
    }

    return documentOperations;
}

export async function syncDocumentOperations({
    document,
    otherDocument,
    engine,
    existingOperations,
    newOperations,
    resourceUrls,
    propagateLastModifiedAt,
}: {
    document: SolidDocument;
    otherDocument: SolidDocument;
    engine: Engine;
    existingOperations: Operation[];
    newOperations: Operation[];
    resourceUrls: string[];
    propagateLastModifiedAt: boolean;
}): Promise<void> {
    const documentTombstones = await Tombstone.createManyFromDocument(document);
    const otherDocumentTombstones = await Tombstone.createManyFromDocument(otherDocument);
    const documentMetadatas = await Metadata.createManyFromDocument(document);
    const otherDocumentMetadatas = await Metadata.createManyFromDocument(otherDocument);
    const documentTombstonesByResourceUrl = objectFromEntries(
        documentTombstones.map((tombstone) => [tombstone.resourceUrl, tombstone]),
    );
    const otherDocumentTombstonesByResourceUrl = objectFromEntries(
        otherDocumentTombstones.map((tombstone) => [tombstone.resourceUrl, tombstone]),
    );
    const newResourceUrls = resourceUrls.filter(
        (url) => !document.contains(url) && !documentTombstonesByResourceUrl[url],
    );
    const deletedResourceUrls = Object.keys(otherDocumentTombstonesByResourceUrl).filter((url) =>
        document.contains(url));

    const documentOperations = ([] as EngineOperation[])
        .concat(
            getNewDocumentOperations({
                documentMetadatas,
                otherDocumentMetadatas,
                existingOperations,
                newOperations,
            }),
        )
        .concat(
            getNewResourcesDocumentOperations({
                otherDocument,
                newResourceUrls,
            }),
        )
        .concat(
            getDeletedResourcesDocumentOperations({
                document,
                documentMetadatas,
                otherDocumentTombstones,
                deletedResourceUrls,
            }),
        );

    await engine.updateDocument(
        document.url,
        documentOperations,
        propagateLastModifiedAt ? { lastModifiedAt: otherDocument.getLastModified() ?? undefined } : undefined,
    );
}
