import { RDFNamedNode, SolidStore } from '@noeldemartin/solid-utils';
import { deepEquals, hasItems, invade, isTruthy, tap, weakMemo } from '@noeldemartin/utils';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import { getRDFIRIVariants, getRDFNamedNodeVariants } from 'soukai-bis/lib/internals/rdf-prefix-aliases';
import { isChangeTrackingDisabled } from 'soukai-bis/models/change-tracking';
import { getSoftDeletedResourceUrls } from 'soukai-bis/models/crdts/soft-deletes';
import { getFieldRDFProperties, getSchema } from 'soukai-bis/models/internals/model';
import { getDocumentQuads, isBlankNodeUrl, quadsSourceDocumentUrls } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import type { Relation } from 'soukai-bis/models/relations';
import { isMultiModelRelation, isSingleModelRelation } from 'soukai-bis/models/relations/helpers';
import {
    MODELS_IN_SAME_DOCUMENT,
    MODEL_IN_SAME_DOCUMENT,
    NEW_MODEL,
    NEW_MODELS,
} from 'soukai-bis/models/relations/internals';
import type { ModelConstructor, ModelWithUrl, ModelsCache } from 'soukai-bis/models/types';
import { buildModelsCache } from 'soukai-bis/models/utils';
import { castToJavaScript, hasMalformedRDFObjects } from 'soukai-bis/zod/utils';

function buildSubjectStore(subject: string, quads: Quad[]): SolidStore {
    const subjectQuadsIndex = weakMemo('subject-quads-index', quads, () => {
        const index = new Map<string, Quad[]>();

        for (const quad of quads) {
            const quadSubject = quad.subject.value;
            const subjectQuads = index.get(quadSubject) ?? tap([], (arr) => index.set(quadSubject, arr));

            subjectQuads.push(quad);
        }

        return index;
    });

    return new SolidStore(subjectQuadsIndex.get(subject));
}

function rdfValuesEqual(a: unknown, b: unknown): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        return deepEquals(a, b);
    }

    return a.length === b.length && a.every((item) => b.some((other) => deepEquals(item, other)));
}

function getDocumentRelations(model: Model, names?: string[]): Relation[] {
    return Object.entries(getSchema(model.static()).relations)
        .filter(([name, definition]) => definition.options.usingSameDocument && (!names || names.includes(name)))
        .map(([name]) => model.getRelation(name));
}

function collectResettableDocumentModels(rootModel: Model): Model[] {
    const models = new Set<Model>();
    const pending: Model[] = [rootModel];

    while (pending.length > 0) {
        const model = pending.pop()!;

        if (models.has(model)) {
            continue;
        }

        models.add(model);

        const relations = invade(model, ['_relations'])._relations;

        for (const [relationName, relation] of Object.entries(relations)) {
            if (relationName === 'operations' || relationName === 'tombstone') {
                continue;
            }

            const documentUrl = model.getDocumentUrl();
            const candidates = new Set<Model>(relation.getLoadedModels());

            if (isSingleModelRelation(relation) && relation[MODEL_IN_SAME_DOCUMENT]) {
                candidates.add(relation[MODEL_IN_SAME_DOCUMENT]);
            }

            if (isMultiModelRelation(relation)) {
                for (const sameDocumentModel of relation[MODELS_IN_SAME_DOCUMENT] ?? []) {
                    candidates.add(sameDocumentModel);
                }
            }

            for (const related of candidates) {
                if (isUsingSameDocument(documentUrl, relation, related) || isBlankNodeUrl(related.url)) {
                    pending.push(related);
                }
            }
        }
    }

    return Array.from(models);
}

export type RDFTypeMap = Map<string, Set<string>>;

export interface HydrateFromRDFOptions {
    modelsCache?: ModelsCache;
    includeSoftDeleted?: boolean;
    sourceDocumentUrl?: string;
}

export function initializeEmptyDocumentRelations(model: Model): void {
    for (const relation of getDocumentRelations(model)) {
        if (relation.loaded || relation.isEmpty() === false) {
            continue;
        }

        relation.related = isMultiModelRelation(relation) ? [] : null;
        relation.documentModelsLoaded = true;
    }
}

export async function loadDocumentRelations(
    model: Model,
    options: { models?: Model[]; relations?: string[] } = {},
): Promise<void> {
    let quads: Quad[] | null = null;
    let modelsCache: ModelsCache | null = null;
    let documentModels = options.models ?? model.getDocumentModels();
    const visitedModels = new Set<Model>();

    while (documentModels.length > 0) {
        for (const documentModel of documentModels) {
            visitedModels.add(documentModel);

            if (!documentModel.exists()) {
                continue;
            }

            for (const relation of getDocumentRelations(documentModel, options.relations)) {
                if (relation.loaded || relation.isEmpty() === true) {
                    continue;
                }

                quads ??= getDocumentQuads(
                    await model
                        .static()
                        .requireEngine()
                        .readDocument(model.getSourceDocumentUrl() ?? model.requireDocumentUrl()),
                );
                modelsCache ??= buildModelsCache(model.getDocumentModels());

                await relation.loadFromDocumentRDF(quads, { modelsCache });
            }
        }

        documentModels = options.models ? [] : model.getDocumentModels().filter((other) => !visitedModels.has(other));
    }
}

export function isUsingSameDocument(documentUrl: string | null, relation: Relation, model: Model): boolean {
    return (documentUrl && model.getDocumentUrl() === documentUrl) || relation.usingSameDocument;
}

export function buildRDFTypeMap(quads: Quad[]): RDFTypeMap {
    return weakMemo('quads-type-map', quads, () => {
        const typeMap = new Map();

        for (const quad of quads) {
            if (quad.predicate.value !== RDF_TYPE) {
                continue;
            }

            const resourceUrls =
                typeMap.get(quad.object.value) ?? tap(new Set(), (set) => void typeMap.set(quad.object.value, set));

            resourceUrls.add(quad.subject.value);
        }

        return typeMap;
    });
}

export function readRDFAttributes(
    modelClass: ModelConstructor,
    url: string,
    quads: Quad[],
): {
    attributes: Record<string, unknown>;
    staleRDFProperties: string[];
    aliasedRDFProperties: string[];
    malformedAttributes: string[];
} {
    const { fields } = getSchema(modelClass);
    const subject = new RDFNamedNode(url);
    const attributes: Record<string, unknown> = {};
    const staleRDFProperties: string[] = [];
    const aliasedRDFProperties: string[] = [];
    const malformedAttributes: string[] = [];
    const store = buildSubjectStore(url, quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        const values = getFieldRDFProperties(modelClass, field).map((property) => {
            const variants = getRDFNamedNodeVariants(property);
            let objects: [Quad_Object, ...Quad_Object[]] | undefined;
            let aliasMatched = false;

            for (let i = 0; i < variants.length; i++) {
                const variantObjects = store.statements(subject, variants[i]!).map((statement) => statement.object);

                if (!hasItems(variantObjects)) {
                    continue;
                }

                if (i > 0) {
                    aliasMatched = true;
                }

                objects ??= variantObjects;
            }

            if (aliasMatched) {
                aliasedRDFProperties.push(property.value);
            }

            return {
                property: property.value,
                objects,
                value: objects ? castToJavaScript(objects, type) : undefined,
            };
        });
        const matchedProperty = values.find((propertyValue) => propertyValue.value !== undefined);

        if (!matchedProperty) {
            continue;
        }

        attributes[field] = matchedProperty.value;

        if (matchedProperty.objects && hasMalformedRDFObjects(matchedProperty.objects, type)) {
            malformedAttributes.push(field);
        }

        for (const propertyValue of values) {
            if (rdfValuesEqual(propertyValue.value, matchedProperty.value)) {
                continue;
            }

            staleRDFProperties.push(propertyValue.property);
        }
    }

    return { attributes, staleRDFProperties, aliasedRDFProperties, malformedAttributes };
}

export function hasMalformedRDFAttributes(modelClass: ModelConstructor, url: string, quads: Quad[]): boolean {
    const { fields } = getSchema(modelClass);
    const subject = new RDFNamedNode(url);
    const store = buildSubjectStore(url, quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        for (const property of getFieldRDFProperties(modelClass, field)) {
            let objects: Quad_Object[] | undefined;

            for (const variant of getRDFNamedNodeVariants(property)) {
                const variantObjects = store.statements(subject, variant).map((statement) => statement.object);

                if (hasItems(variantObjects)) {
                    objects = variantObjects;
                    break;
                }
            }

            if (objects) {
                if (hasMalformedRDFObjects(objects, type)) {
                    return true;
                }

                break;
            }
        }
    }

    return false;
}

export function createFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    url: string,
    quads: Quad[],
    options: { typeMap?: RDFTypeMap } = {},
): ModelWithUrl<T> {
    const { attributes, staleRDFProperties, aliasedRDFProperties, malformedAttributes } = readRDFAttributes(
        modelClass,
        url,
        quads,
    );
    const instance = modelClass.newInstance(
        { url, ...attributes },
        { exists: true, initializeMetadata: false, source: quads },
    ) as ModelWithUrl<T>;
    const aliasedRDFClasses =
        options.typeMap &&
        modelClass.getRDFClasses().some((rdfClass) => {
            const variants = getRDFIRIVariants(rdfClass);

            return variants.length > 1 && variants.slice(1).some((variant) => options.typeMap?.get(variant)?.has(url));
        });

    invade(instance, ['addStaleRDFProperties']).addStaleRDFProperties(staleRDFProperties);

    if (malformedAttributes.length > 0) {
        invade(instance, ['_malformedAttributes'])._malformedAttributes = new Set(malformedAttributes);
    }

    if (aliasedRDFClasses || aliasedRDFProperties.length > 0) {
        invade(instance, ['setRDFPrefixAliasesInUse']).setRDFPrefixAliasesInUse(
            !!aliasedRDFClasses,
            aliasedRDFProperties,
        );
    }

    return instance;
}

export function findMatchingRDFResourceUrls(
    modelClass: ModelConstructor,
    quads: Quad[],
    options: { includeSoftDeleted?: boolean } = {},
): string[] {
    const typeMap = buildRDFTypeMap(quads);
    const softDeletedUrls = options.includeSoftDeleted ? null : getSoftDeletedResourceUrls(quads);
    const candidateUrls = new Set(
        modelClass
            .getRDFClasses()
            .flatMap((rdfClass) => getRDFIRIVariants(rdfClass))
            .flatMap((rdfClass) => [...(typeMap.get(rdfClass) ?? [])]),
    );

    return Array.from(candidateUrls).filter(
        (url) =>
            !softDeletedUrls?.has(url) && modelClass.matchesRDFClasses((rdfClass) => !!typeMap.get(rdfClass)?.has(url)),
    );
}

export async function hydrateModelFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    quads: Quad[],
    url: string,
    options: HydrateFromRDFOptions = {},
): Promise<ModelWithUrl<T> | null> {
    const modelsCache = options.modelsCache ?? new Map();
    const typeMap = buildRDFTypeMap(quads);
    const isType = modelClass.matchesRDFClasses((rdfClass) => !!typeMap.get(rdfClass)?.has(url));

    if (!isType || (!options.includeSoftDeleted && getSoftDeletedResourceUrls(quads).has(url))) {
        return null;
    }

    const existingClassCache = modelsCache.get(url);

    if (existingClassCache?.has(modelClass)) {
        return existingClassCache.get(modelClass) as ModelWithUrl<T>;
    }

    const classCache = existingClassCache ?? new WeakMap();
    const instance = createFromRDF<T>(modelClass, url, quads, { typeMap });

    instance.setSourceDocumentUrl(options.sourceDocumentUrl ?? quadsSourceDocumentUrls.get(quads) ?? null);
    modelsCache.set(url, classCache);
    classCache.set(modelClass, instance);

    for (const [relationName, relationDefinition] of Object.entries(getSchema(modelClass).relations)) {
        if (relationDefinition.options.autoload === false) {
            continue;
        }

        await instance.getRelation(relationName).loadFromDocumentRDF(quads, { modelsCache });
    }

    invade(instance, ['initializeLegacyTimestamps']).initializeLegacyTimestamps(quads);

    await invade(instance, ['restoreComputedAttributes']).restoreComputedAttributes();

    return instance;
}

export async function hydrateModelsFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    quads: Quad[],
    options: HydrateFromRDFOptions = {},
): Promise<ModelWithUrl<T>[]> {
    const matchingResourceUrls = findMatchingRDFResourceUrls(modelClass, quads, options);

    if (matchingResourceUrls.length === 0) {
        return [];
    }

    const modelsCache = options.modelsCache ?? new Map();
    const models = await Promise.all(
        matchingResourceUrls.map((resourceUrl) =>
            hydrateModelFromRDF(modelClass, quads, resourceUrl, {
                modelsCache,
                includeSoftDeleted: options.includeSoftDeleted,
                sourceDocumentUrl: options.sourceDocumentUrl,
            }),
        ),
    );

    return models.filter(isTruthy);
}

export function resetModelGraph(rootModel: Model): void {
    const models = collectResettableDocumentModels(rootModel);
    const modelsSet = new Set(models);
    const oldUrls = new Set(models.map((model) => model.url).filter(isTruthy));

    for (const model of models) {
        const invadedModel = invade(model, [
            '_attributes',
            '_originalAttributes',
            '_dirtyAttributes',
            '_exists',
            '_documentExists',
            '_sourceDocumentUrl',
            '_staleRDFProperties',
            '_rdfPrefixAliases',
            '_malformedAttributes',
            '_pendingMalformedAttributeFixes',
            '_relations',
        ]);
        const attributes = invadedModel._attributes;

        delete attributes.url;

        for (const [field, value] of Object.entries(attributes)) {
            if (typeof value === 'string' && oldUrls.has(value)) {
                delete attributes[field];
            } else if (Array.isArray(value)) {
                const filtered = value.filter((item) => !(typeof item === 'string' && oldUrls.has(item)));

                if (filtered.length !== value.length) {
                    attributes[field] = filtered;
                }
            }
        }

        invadedModel._exists = false;
        invadedModel._documentExists = false;
        invadedModel._sourceDocumentUrl = null;
        invadedModel._originalAttributes = {};
        invadedModel._dirtyAttributes = new Set(Object.keys(attributes));
        invadedModel._staleRDFProperties = null;
        invadedModel._rdfPrefixAliases = null;
        invadedModel._malformedAttributes = null;
        invadedModel._pendingMalformedAttributeFixes = null;

        for (const [relationName, relation] of Object.entries(invadedModel._relations)) {
            if (relationName === 'operations') {
                relation.related = [];

                if (isMultiModelRelation(relation)) {
                    delete relation[NEW_MODELS];
                    delete relation[MODELS_IN_SAME_DOCUMENT];
                }

                continue;
            }

            if (relationName === 'tombstone') {
                relation.related = null;

                if (isSingleModelRelation(relation)) {
                    delete relation[NEW_MODEL];
                    delete relation[MODEL_IN_SAME_DOCUMENT];
                }

                continue;
            }

            if (isSingleModelRelation(relation)) {
                const candidate = relation.related ?? relation[MODEL_IN_SAME_DOCUMENT];

                delete relation[MODEL_IN_SAME_DOCUMENT];

                if (candidate && modelsSet.has(candidate)) {
                    relation[NEW_MODEL] = candidate;

                    if (relationName === 'metadata') {
                        const metadataAttributes = invade(candidate, ['_attributes', '_dirtyAttributes']);

                        delete metadataAttributes._attributes.deletedAt;
                        metadataAttributes._dirtyAttributes.delete('deletedAt');
                    }
                }
            }

            if (isMultiModelRelation(relation)) {
                const candidates = relation.related ?? relation[MODELS_IN_SAME_DOCUMENT] ?? [];

                delete relation[MODELS_IN_SAME_DOCUMENT];

                const newRelated = candidates.filter((related) => modelsSet.has(related));

                if (newRelated.length > 0) {
                    relation[NEW_MODELS] = newRelated;
                }
            }
        }
    }

    for (const model of models) {
        if (!model.hasTimestamps() || model.metadata || isChangeTrackingDisabled()) {
            continue;
        }

        const invadedModel = invade(model, ['_legacyTimestamps', 'initializeMetadata']);

        invadedModel.initializeMetadata(invadedModel._legacyTimestamps ?? undefined);
    }
}
