import { RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import { isInstanceOf, objectFromEntries, required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import {
    CRDT_DELETED_AT_PREDICATE,
    CRDT_METADATA_OBJECT,
    CRDT_RESOURCE_PREDICATE,
    CRDT_RESTORE_OPERATION_OBJECT,
    CRDT_SET_PROPERTY_OPERATION_OBJECT,
    CRDT_SOFT_DELETE_OPERATION_OBJECT,
    CRDT_UNSET_PROPERTY_OPERATION_OBJECT,
    CRDT_UPDATED_AT,
    CRDT_UPDATED_AT_PREDICATE,
    CRDT_TOMBSTONE_OBJECT,
    RDF_TYPE_PREDICATE,
    createRDFLiteral,
} from 'soukai-bis/lib/internals/rdf';
import { normalizeRDFIRI } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { createModelInceptionOperations } from 'soukai-bis/models/concerns/crdts';
import {
    getTombstoneUrl,
    isLifecycleOperation,
    sortedOperations,
    supersedesOperation,
} from 'soukai-bis/models/crdts/helpers';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import type Operation from 'soukai-bis/models/crdts/Operation';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import Tombstone from 'soukai-bis/models/crdts/Tombstone';
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
    metadataUrls,
}: {
    existingOperations: Operation[];
    newOperations: Operation[];
    metadataUrls: Record<string, string>;
}): EngineOperation[] {
    const operations: Operation[] = [];
    const existingPropertyOperations = existingOperations.filter((operation) => operation instanceof PropertyOperation);
    const existingLifecycleOperations = existingOperations.filter(isLifecycleOperation);

    for (const newOperation of newOperations) {
        operations.push(...newOperation.createDocumentOperations());

        if (
            isInstanceOf(newOperation, PropertyOperation) &&
            existingPropertyOperations.some(
                (existingOperation) =>
                    existingOperation.resourceUrl === newOperation.resourceUrl &&
                    normalizeRDFIRI(existingOperation.property) === normalizeRDFIRI(newOperation.property) &&
                    existingOperation.date > newOperation.date,
            )
        ) {
            continue;
        }

        if (isLifecycleOperation(newOperation)) {
            if (
                existingLifecycleOperations.some(
                    (existingOperation) =>
                        existingOperation.resourceUrl === newOperation.resourceUrl &&
                        supersedesOperation(existingOperation, newOperation),
                )
            ) {
                continue;
            }

            const metadataUrl = metadataUrls[newOperation.resourceUrl];

            metadataUrl && newOperation.setMetadataSubject(new RDFNamedNode(metadataUrl));
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
    const newSortedOperations = sortedOperations(newOperations);
    const metadataUrls = objectFromEntries(
        [...otherDocumentMetadatas, ...documentMetadatas]
            .filter((metadata) => !!metadata.resourceUrl)
            .map((metadata) => [required(metadata.resourceUrl), metadata.url]),
    );
    const documentOperations = getDocumentUpdateOperations({
        existingOperations,
        newOperations: newSortedOperations,
        metadataUrls,
    });
    const metadataUpdates = getMetadataUpdates({
        documentMetadatas,
        otherDocumentMetadatas,
        newOperations: newSortedOperations,
    });

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
        if (resourceUrl.endsWith('/')) {
            continue;
        }

        const quads = [
            ...otherDocument.statements(resourceUrl),
            ...otherDocument
                .statements(undefined, CRDT_RESOURCE_PREDICATE, resourceUrl)
                .map((quad) =>
                    otherDocument.statement(quad.subject.value, RDF_TYPE_PREDICATE, CRDT_METADATA_OBJECT)
                        ? otherDocument.statements(quad.subject.value)
                        : [],
                )
                .flat(),
        ];

        const quadsByResourceProperty: Record<string, Record<string, [Quad, ...Quad[]]>> = {};

        for (const quad of quads) {
            const resourceQuads = (quadsByResourceProperty[quad.subject.value] ??= {});
            const propertyQuads = (resourceQuads[quad.predicate.value] ??= [] as unknown as [Quad, ...Quad[]]);

            propertyQuads.push(quad);
        }

        for (const [quadsResourceUrl, resourceQuads] of Object.entries(quadsByResourceProperty)) {
            for (const [property, propertyQuads] of Object.entries(resourceQuads)) {
                documentOperations.push(
                    new SetPropertyOperation({
                        resourceUrl: quadsResourceUrl,
                        property,
                        value: propertyQuads.map((quad) => quad.object.value),
                        date: new Date(),
                    })
                        .setNamedNode(propertyQuads[0].object.termType === 'NamedNode')
                        .setSubject(propertyQuads[0].subject)
                        .setPredicate(propertyQuads[0].predicate)
                        .setValues(propertyQuads.map((quad) => quad.object)),
                );
            }
        }
    }

    return documentOperations;
}

function getDeletedResourcesDocumentOperations({
    document,
    documentMetadatas,
    otherDocumentTombstones,
    deletedResourceUrls,
    copyTombstones,
}: {
    document: SolidDocument;
    documentMetadatas: ModelWithUrl<Metadata>[];
    otherDocumentTombstones: ModelWithUrl<Tombstone>[];
    deletedResourceUrls: string[];
    copyTombstones: boolean;
}): EngineOperation[] {
    const documentOperations: EngineOperation[] = [];
    const createdTombstones = copyTombstones
        ? otherDocumentTombstones.filter((tombstone) => deletedResourceUrls.includes(tombstone.resourceUrl))
        : [];
    const deletedMetadatas = documentMetadatas.filter(
        (metadata) => metadata.resourceUrl && deletedResourceUrls.includes(metadata.resourceUrl),
    );
    const deletedOperationUrls = [
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_SET_PROPERTY_OPERATION_OBJECT),
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_UNSET_PROPERTY_OPERATION_OBJECT),
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_SOFT_DELETE_OPERATION_OBJECT),
        ...document.statements(undefined, RDF_TYPE_PREDICATE, CRDT_RESTORE_OPERATION_OBJECT),
    ]
        .filter((quad) =>
            deletedResourceUrls.some((resourceUrl) =>
                document.contains(quad.subject, CRDT_RESOURCE_PREDICATE, resourceUrl),
            ),
        )
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

export interface SyncDocumentOperationsOptions {
    document: SolidDocument;
    otherDocument: SolidDocument;
    existingOperations: Operation[];
    newOperations: Operation[];
    resourceUrls: string[];
    copyTombstones?: boolean;
}

export async function getSyncDocumentOperations({
    document,
    otherDocument,
    existingOperations,
    newOperations,
    resourceUrls,
    copyTombstones = true,
}: SyncDocumentOperationsOptions): Promise<EngineOperation[]> {
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
        document.contains(url),
    );

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
                copyTombstones,
            }),
        );

    return documentOperations;
}

export function addLocalDeletionTombstones(
    localDocument: SolidDocument,
    remoteDocument: SolidDocument,
    deletedResourceUrls: Set<string>,
): SolidDocument {
    if (deletedResourceUrls.size === 0) {
        return localDocument;
    }

    const deletedAt = createRDFLiteral(new Date());
    const quads = [...localDocument.getQuads()];

    for (const resourceUrl of deletedResourceUrls) {
        if (!remoteDocument.contains(resourceUrl)) {
            continue;
        }

        const tombstone = new RDFNamedNode(getTombstoneUrl(resourceUrl));

        quads.push(
            new RDFQuad(tombstone, RDF_TYPE_PREDICATE, CRDT_TOMBSTONE_OBJECT),
            new RDFQuad(tombstone, CRDT_RESOURCE_PREDICATE, new RDFNamedNode(resourceUrl)),
            new RDFQuad(tombstone, CRDT_DELETED_AT_PREDICATE, deletedAt),
        );
    }

    return new SolidDocument(localDocument.url, quads, localDocument.headers);
}

export function applyOperationsToDocument(document: SolidDocument, operations: EngineOperation[]): SolidDocument {
    const quads = operations.reduce(
        (documentQuads, operation) => operation.applyToQuads(documentQuads),
        [...document.getQuads()],
    );

    return new SolidDocument(document.url, quads, document.headers);
}

export function withoutTombstones(quads: Quad[]): Quad[] {
    const tombstoneUrls = new Set(
        quads
            .filter((quad) => quad.predicate.equals(RDF_TYPE_PREDICATE) && quad.object.equals(CRDT_TOMBSTONE_OBJECT))
            .map((quad) => quad.subject.value),
    );

    return tombstoneUrls.size === 0 ? quads : quads.filter((quad) => !tombstoneUrls.has(quad.subject.value));
}
