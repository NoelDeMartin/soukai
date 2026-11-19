import { RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import { arrayFilter, objectFromEntries, required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import {
    CRDT_DELETED_AT_PREDICATE,
    CRDT_METADATA_OBJECT,
    CRDT_RESOURCE_PREDICATE,
    CRDT_UPDATED_AT,
    CRDT_UPDATED_AT_PREDICATE,
    CRDT_TOMBSTONE_OBJECT,
    RDF_TYPE_PREDICATE,
    createRDFLiteral,
} from 'soukai-bis/lib/internals/rdf';
import { createModelInceptionOperations, getResourceOperationUrls } from 'soukai-bis/models/concerns/crdts';
import {
    getTombstoneUrl,
    isArrayPropertyOperation,
    isLifecycleOperation,
    isPropertyOperation,
    isSupersededResetOperation,
    sameProperty,
    sortedOperations,
    supersedesOperation,
    withEffectiveValues,
} from 'soukai-bis/models/crdts/helpers';
import Metadata from 'soukai-bis/models/crdts/Metadata';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import Tombstone from 'soukai-bis/models/crdts/Tombstone';
import type { TimestampField } from 'soukai-bis/models/schema';
import type { ModelWithUrl } from 'soukai-bis/models/types';

function tracksTimestamp(metadata: Metadata, field: TimestampField): boolean {
    return !!metadata[field] || (!metadata.createdAt && !metadata.updatedAt);
}

function getMetadataUpdates({
    documentMetadatas,
    otherDocumentMetadatas,
    newOperations,
}: {
    documentMetadatas: ModelWithUrl<Metadata>[];
    otherDocumentMetadatas: ModelWithUrl<Metadata>[];
    newOperations: Operation[];
}): Record<string, { exists: boolean; url: string; createdAt?: Date; updatedAt?: Date }> {
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
                createdAt: instance.createdAt,
                updatedAt: instance.updatedAt,
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
                    createdAt: tracksTimestamp(otherMetadata, 'createdAt') ? operation.date : undefined,
                    updatedAt: tracksTimestamp(otherMetadata, 'updatedAt') ? operation.date : undefined,
                });
            }

            continue;
        }

        if (metadata.createdAt && operation.date < metadata.createdAt) {
            metadata.createdAt = operation.date;
            metadata.updated = true;
        }

        if (metadata.updatedAt && operation.date > metadata.updatedAt) {
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

function getPropertyUpdateOperations(
    operation: PropertyOperation,
    existingOperations: PropertyOperation[],
    allOperations: PropertyOperation[],
): Operation[] {
    if (isArrayPropertyOperation(operation)) {
        return arrayFilter([withEffectiveValues(operation, allOperations)]);
    }

    if (isSupersededResetOperation(operation, existingOperations)) {
        return [];
    }

    const arrayOperationsToReapply = sortedOperations(
        existingOperations
            .filter(isArrayPropertyOperation)
            .filter((other) => sameProperty(operation, other) && supersedesOperation(other, operation)),
    );

    return [
        operation,
        ...arrayFilter(arrayOperationsToReapply.map((other) => withEffectiveValues(other, allOperations))),
    ];
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
    const existingPropertyOperations = existingOperations.filter(isPropertyOperation);
    const existingLifecycleOperations = existingOperations.filter(isLifecycleOperation);
    const allPropertyOperations = [...existingPropertyOperations, ...newOperations.filter(isPropertyOperation)];

    for (const newOperation of newOperations) {
        operations.push(...newOperation.createDocumentOperations());

        if (isPropertyOperation(newOperation)) {
            operations.push(
                ...getPropertyUpdateOperations(newOperation, existingPropertyOperations, allPropertyOperations),
            );

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
            documentOperations.push(
                ...createModelInceptionOperations(instance, required(metadata.createdAt ?? metadata.updatedAt)),
            );

            continue;
        }

        if (!metadata.updatedAt) {
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
    const deletedOperationUrls = deletedResourceUrls.flatMap((url) => getResourceOperationUrls(document, url));

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

export function documentWithTombstones(document: SolidDocument, resourceUrls: Iterable<string>): SolidDocument {
    const deletedAt = createRDFLiteral(new Date());
    const quads = [...document.getQuads()];

    for (const resourceUrl of resourceUrls) {
        const tombstone = new RDFNamedNode(getTombstoneUrl(resourceUrl));

        quads.push(
            new RDFQuad(tombstone, RDF_TYPE_PREDICATE, CRDT_TOMBSTONE_OBJECT),
            new RDFQuad(tombstone, CRDT_RESOURCE_PREDICATE, new RDFNamedNode(resourceUrl)),
            new RDFQuad(tombstone, CRDT_DELETED_AT_PREDICATE, deletedAt),
        );
    }

    return new SolidDocument(document.url, quads, document.headers);
}

export function getTombstoneUrls(document: SolidDocument, resourceUrls: Set<string>): string[] {
    return document
        .statements(undefined, RDF_TYPE_PREDICATE, CRDT_TOMBSTONE_OBJECT)
        .map((quad) => quad.subject.value)
        .filter((tombstoneUrl) =>
            document
                .statements(tombstoneUrl, CRDT_RESOURCE_PREDICATE)
                .some((quad) => resourceUrls.has(quad.object.value)),
        );
}

export function getTombstonedResourceUrls(document: SolidDocument): Set<string> {
    return new Set(
        document
            .statements(undefined, RDF_TYPE_PREDICATE, CRDT_TOMBSTONE_OBJECT)
            .flatMap((quad) => document.statements(quad.subject.value, CRDT_RESOURCE_PREDICATE))
            .map((quad) => quad.object.value),
    );
}

export function documentWithoutSubjects(document: SolidDocument, subjectUrls: string[]): SolidDocument {
    if (subjectUrls.length === 0) {
        return document;
    }

    const quads = document.getQuads().filter((quad) => !subjectUrls.includes(quad.subject.value));

    return new SolidDocument(document.url, quads, document.headers);
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
