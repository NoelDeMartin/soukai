import { RDFNamedNode, SolidStore } from '@noeldemartin/solid-utils';
import { deepEquals, hasItems, invade, tap, weakMemo } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import { getFieldRdfProperties, getSchema } from 'soukai-bis/models/internals/model';
import { getDocumentQuads } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import type { Relation } from 'soukai-bis/models/relations';
import { isMultiModelRelation } from 'soukai-bis/models/relations/helpers';
import type { ModelConstructor, ModelWithUrl, ModelsCache } from 'soukai-bis/models/types';
import { buildModelsCache } from 'soukai-bis/models/utils';
import { castToJavaScript, getFinalType } from 'soukai-bis/zod/utils';

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

export function buildRDFTypeIndex(quads: Quad[]): Map<string, Set<string>> {
    return weakMemo('quads-type-index', quads, () => {
        const typeIndex = new Map();

        for (const quad of quads) {
            if (quad.predicate.value !== RDF_TYPE) {
                continue;
            }

            const resourceUrls =
                typeIndex.get(quad.object.value) ?? tap(new Set(), (set) => void typeIndex.set(quad.object.value, set));

            resourceUrls.add(quad.subject.value);
        }

        return typeIndex;
    });
}

export function readRDFAttributes(
    modelClass: ModelConstructor,
    url: string,
    quads: Quad[],
): { attributes: Record<string, unknown>; staleRdfProperties: string[] } {
    const { fields } = getSchema(modelClass);
    const subject = new RDFNamedNode(url);
    const attributes: Record<string, unknown> = {};
    const staleRdfProperties: string[] = [];
    const store = buildSubjectStore(url, quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        const fieldType = getFinalType(type);
        const values = getFieldRdfProperties(modelClass, field).map((property) => {
            const objects = store.statements(subject, property).map((statement) => statement.object);

            return {
                property: property.value,
                value: hasItems(objects) ? castToJavaScript(objects, fieldType) : undefined,
            };
        });
        const value = values.find((propertyValue) => propertyValue.value !== undefined)?.value;

        if (value === undefined) {
            continue;
        }

        attributes[field] = value;

        for (const propertyValue of values) {
            if (rdfValuesEqual(propertyValue.value, value)) {
                continue;
            }

            staleRdfProperties.push(propertyValue.property);
        }
    }

    return { attributes, staleRdfProperties };
}

export function createFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    url: string,
    quads: Quad[],
): ModelWithUrl<T> {
    const { attributes, staleRdfProperties } = readRDFAttributes(modelClass, url, quads);
    const instance = modelClass.newInstance(
        { url, ...attributes },
        { exists: true, initializeMetadata: false, source: quads },
    ) as ModelWithUrl<T>;

    invade(instance, ['addStaleRdfProperties']).addStaleRdfProperties(staleRdfProperties);

    return instance;
}
