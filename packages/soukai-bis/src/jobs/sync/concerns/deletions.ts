import { SolidStore } from '@noeldemartin/solid-utils';
import type { SolidDocument } from '@noeldemartin/solid-utils';
import { weakMemo } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import { getLocallyDeletedResourceUrls } from 'soukai-bis/engines/local-changes';
import type { DocumentLocalChanges } from 'soukai-bis/engines/LocalEngine';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { normalizeRDFIRI } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import type Operation from 'soukai-bis/models/crdts/Operation';
import { getFieldRDFProperties, getSchema } from 'soukai-bis/models/internals/model';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import { isMultiModelRelation } from 'soukai-bis/models/relations/helpers';
import { MODELS_IN_SAME_DOCUMENT } from 'soukai-bis/models/relations/internals';
import type { ModelConstructor, ModelsCache } from 'soukai-bis/models/types';
import { isArrayField } from 'soukai-bis/zod/utils';

import { getTombstonedResourceUrls } from './document-operations';

function isArrayProperty(document: SolidDocument, link: Quad, models: ModelConstructor[]): boolean {
    const types = new Set(document.statements(link.subject, RDF_TYPE_PREDICATE).map((quad) => quad.object.value));
    const property = normalizeRDFIRI(link.predicate.value);

    return models
        .filter((modelClass) => modelClass.matchesRDFClasses(types))
        .some((modelClass) =>
            Object.entries(getSchema(modelClass).fields.def.shape).some(
                ([field, definition]) =>
                    isArrayField(definition) &&
                    getFieldRDFProperties(modelClass, field).some(
                        (fieldProperty) => normalizeRDFIRI(fieldProperty.value) === property,
                    ),
            ),
        );
}

function getStoreQuads(store: SolidStore): Quad[] {
    return weakMemo('store-quads', store, () => store.getQuads());
}

async function getCascadingUrls(model: Model, store: SolidStore, modelsCache: ModelsCache): Promise<string[]> {
    const urls: string[] = [];

    for (const name of Object.keys(getSchema(model.static()).relations)) {
        const relation = model.getRelation(name);

        if (relation.onDelete !== 'cascade') {
            continue;
        }

        await relation.loadFromDocumentRDF(getStoreQuads(store), { modelsCache, includeSoftDeleted: true });

        const relatedModels = [
            ...relation.getLoadedModels(),
            ...((isMultiModelRelation(relation) && relation[MODELS_IN_SAME_DOCUMENT]) || []),
        ];

        for (const relatedModel of relatedModels) {
            if (relatedModel.url && store.contains(relatedModel.url)) {
                urls.push(relatedModel.url);
            }
        }
    }

    return urls;
}

async function getDependants(store: SolidStore, resourceUrl: string, models: ModelConstructor[]): Promise<Set<string>> {
    const modelsCache: ModelsCache = new Map();
    const dependants = new Set<string>();
    const pendingUrls = [resourceUrl];

    for (let url = pendingUrls.pop(); url; url = pendingUrls.pop()) {
        for (const modelClass of models) {
            const model = await modelClass.createFromRDF(getStoreQuads(store), {
                url,
                modelsCache,
                includeSoftDeleted: true,
            });

            if (!model) {
                continue;
            }

            for (const dependantUrl of await getCascadingUrls(model, store, modelsCache)) {
                if (dependantUrl === resourceUrl || dependants.has(dependantUrl)) {
                    continue;
                }

                dependants.add(dependantUrl);
                pendingUrls.push(dependantUrl);
            }
        }
    }

    return dependants;
}

export type ResourceConflictType = 'resource-deleted-remotely' | 'resource-deleted-locally';

export type ResourceConflictResolution = 'delete' | 'restore';

export interface ResourceConflict {
    type: ResourceConflictType;
    resourceUrl: string;
    localDocument: SolidDocument;
    remoteDocument: SolidDocument;
    model: Model | null;
}

export interface DeletionsResolution {
    localDeletions: Set<string>;
    discardedLocalResources: Set<string>;
    restoredRemoteResources: Set<string>;
    restoredLocalResources: Set<string>;
}

export interface SyncingDocument {
    localDocument: SolidDocument;
    remoteDocument: SolidDocument;
    localChanges: DocumentLocalChanges | null;
}

export function getRemoteDeletions({ localDocument, remoteDocument }: SyncingDocument): string[] {
    return Array.from(getTombstonedResourceUrls(remoteDocument)).filter((url) => localDocument.contains(url));
}

export function getLocalDeletions({ remoteDocument, localChanges }: SyncingDocument): string[] {
    return Array.from(getLocallyDeletedResourceUrls(localChanges)).filter((url) => remoteDocument.contains(url));
}

export function getDocumentResolution(resolution: DeletionsResolution, document: SyncingDocument): DeletionsResolution {
    const contains = (url: string) => document.localDocument.contains(url) || document.remoteDocument.contains(url);
    const filter = (urls: Set<string>) => new Set(Array.from(urls).filter(contains));

    return {
        localDeletions: filter(resolution.localDeletions),
        discardedLocalResources: filter(resolution.discardedLocalResources),
        restoredRemoteResources: filter(resolution.restoredRemoteResources),
        restoredLocalResources: filter(resolution.restoredLocalResources),
    };
}

export async function groupDeletions(
    documents: SolidDocument[],
    deletedUrls: string[],
    models: ModelConstructor[],
): Promise<Map<string, Set<string>>> {
    if (deletedUrls.length === 0) {
        return new Map();
    }

    const store = new SolidStore(documents.flatMap((document) => document.getQuads()));
    const dependants = new Map(
        await Promise.all(deletedUrls.map(async (url) => [url, await getDependants(store, url, models)] as const)),
    );
    const isDependant = (url: string) =>
        Array.from(dependants).some(([otherUrl, otherDependants]) => otherUrl !== url && otherDependants.has(url));
    const groups = new Map<string, Set<string>>();
    const groupedUrls = new Set<string>();

    const dependenciesFirstUrls = [
        ...deletedUrls.filter((url) => !isDependant(url)),
        ...deletedUrls.filter(isDependant),
    ];

    for (const url of dependenciesFirstUrls) {
        if (groupedUrls.has(url)) {
            continue;
        }

        const group = new Set([url, ...(dependants.get(url) ?? [])]);

        group.forEach((groupUrl) => groupedUrls.add(groupUrl));
        groups.set(url, group);
    }

    return groups;
}

export function getRestoredLinksOperations({
    linkingDocument,
    unlinkingDocument,
    restoredUrls,
    resourceUrls,
    models,
}: {
    linkingDocument: SolidDocument;
    unlinkingDocument: SolidDocument;
    restoredUrls: Set<string>;
    resourceUrls: string[];
    models: ModelConstructor[];
}): Operation[] {
    if (restoredUrls.size === 0) {
        return [];
    }

    const links = new Map<string, [Quad, ...Quad[]]>();

    for (const quad of linkingDocument.getQuads()) {
        const parentUrl = quad.subject.value;

        if (
            quad.object.termType !== 'NamedNode' ||
            !restoredUrls.has(quad.object.value) ||
            restoredUrls.has(parentUrl) ||
            !resourceUrls.includes(parentUrl) ||
            !unlinkingDocument.contains(parentUrl) ||
            unlinkingDocument.contains(quad.subject, quad.predicate, quad.object)
        ) {
            continue;
        }

        const key = `${parentUrl} ${quad.predicate.value}`;

        links.set(key, [...(links.get(key) ?? []), quad] as [Quad, ...Quad[]]);
    }

    if (links.size === 0) {
        return [];
    }

    const date = new Date();

    return Array.from(links.values()).map((linkQuads) => {
        const [link] = linkQuads;
        const { subject, predicate } = link;
        const isArray = isArrayProperty(linkingDocument, link, models);
        const OperationClass = requireBootedModel(isArray ? 'AddPropertyOperation' : 'SetPropertyOperation');
        const values = (isArray ? linkQuads : linkingDocument.statements(subject, predicate)).map(
            (quad) => quad.object,
        );
        const operation = new OperationClass({
            resourceUrl: subject.value,
            property: predicate.value,
            value: values.map((value) => value.value),
            date,
        })
            .setPredicate(predicate)
            .setNamedNode(values.every((value) => value.termType === 'NamedNode'))
            .setValues(values);

        operation.mintUrl();

        return operation;
    });
}
