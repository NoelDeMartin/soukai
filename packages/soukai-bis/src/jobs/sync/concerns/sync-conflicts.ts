import type { SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';
import { RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { normalizeRDFIRI } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import type Operation from 'soukai-bis/models/crdts/Operation';
import { getFieldRDFProperties, getSchema } from 'soukai-bis/models/internals/model';
import { getDocumentQuads } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import { isMultiModelRelation } from 'soukai-bis/models/relations/helpers';
import { MODELS_IN_SAME_DOCUMENT } from 'soukai-bis/models/relations/internals';
import type { ModelConstructor, ModelsCache } from 'soukai-bis/models/types';
import { isArrayField } from 'soukai-bis/zod/utils';

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

async function getCascadingUrls(model: Model, document: SolidDocument, modelsCache: ModelsCache): Promise<string[]> {
    const urls: string[] = [];

    for (const name of Object.keys(getSchema(model.static()).relations)) {
        const relation = model.getRelation(name);

        if (relation.onDelete !== 'cascade') {
            continue;
        }

        await relation.loadFromDocumentRDF(getDocumentQuads(document), { modelsCache, includeSoftDeleted: true });

        const relatedModels = [
            ...relation.getLoadedModels(),
            ...((isMultiModelRelation(relation) && relation[MODELS_IN_SAME_DOCUMENT]) || []),
        ];

        for (const relatedModel of relatedModels) {
            if (relatedModel.url && document.contains(relatedModel.url)) {
                urls.push(relatedModel.url);
            }
        }
    }

    return urls;
}

async function getDocumentDependants(
    document: SolidDocument,
    resourceUrl: string,
    models: ModelConstructor[],
): Promise<Set<string>> {
    const quads = getDocumentQuads(document);
    const modelsCache: ModelsCache = new Map();
    const dependants = new Set<string>();
    const pendingUrls = [resourceUrl];

    for (let url = pendingUrls.pop(); url; url = pendingUrls.pop()) {
        for (const modelClass of models) {
            const model = await modelClass.createFromRDF(quads, { url, modelsCache, includeSoftDeleted: true });

            if (!model) {
                continue;
            }

            for (const dependantUrl of await getCascadingUrls(model, document, modelsCache)) {
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

export type DeletionConflictType = 'deleted-remotely' | 'deleted-locally';

export type DeletionConflictResolution = 'delete' | 'restore';

export interface DeletionConflict {
    type: DeletionConflictType;
    resourceUrl: string;
    localDocument: SolidDocument;
    remoteDocument: SolidDocument;
}

export async function groupDocumentDeletions(
    document: SolidDocument,
    deletedUrls: string[],
    models: ModelConstructor[],
): Promise<Map<string, Set<string>>> {
    const dependants = new Map(
        await Promise.all(
            deletedUrls.map(async (url) => [url, await getDocumentDependants(document, url, models)] as const),
        ),
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
