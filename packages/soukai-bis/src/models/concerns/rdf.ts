import { RDFNamedNode, RDFQuad, SolidStore } from '@noeldemartin/solid-utils';
import { hasItems, tap, weakMemo } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import { RDF_TYPE } from 'soukai-bis/lib/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import type { Relation } from 'soukai-bis/models/relations';
import { isMultiModelRelation } from 'soukai-bis/models/relations/helpers';
import type { ModelConstructor, ModelWithUrl, ModelsCache } from 'soukai-bis/models/types';
import { buildModelsCache } from 'soukai-bis/models/utils';
import { castToJavaScript, castToRDF, getFinalType } from 'soukai-bis/zod/utils';

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

function getDocumentRelations(model: Model, names?: string[]): Relation[] {
    return Object.entries(model.static('schema').relations)
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

                quads ??= (await model.static().requireEngine().readDocument(model.requireDocumentUrl())).getQuads();
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

export function createFromRDF<T extends Model>(
    modelClass: ModelConstructor<T>,
    url: string,
    quads: Quad[],
): ModelWithUrl<T> {
    const { fields, rdfFieldProperties } = modelClass.schema;
    const subject = new RDFNamedNode(url);
    const attributes: Record<string, unknown> = {};
    const store = buildSubjectStore(url, quads);

    for (const [field, type] of Object.entries(fields.shape)) {
        const fieldType = getFinalType(type);
        const property = rdfFieldProperties[field];
        const objects = store.statements(subject, property).map((value) => value.object);

        if (!property || !hasItems(objects)) {
            continue;
        }

        attributes[field] = castToJavaScript(objects, fieldType);
    }

    return modelClass.newInstance(
        { url, ...attributes },
        { exists: true, initializeMetadata: false, source: quads },
    ) as ModelWithUrl<T>;
}

export function serializeToRDF(models: Model[]): Quad[] {
    const statements: Quad[] = [];

    for (const model of models) {
        const { fields, rdfDefaultResourceHash, rdfClasses, rdfFieldProperties } = model.static('schema');
        const subject = new RDFNamedNode(model.url ?? `#${rdfDefaultResourceHash}`);

        for (const rdfClass of rdfClasses) {
            statements.push(new RDFQuad(subject, RDF_TYPE, rdfClass));
        }

        for (const [field, value] of Object.entries(model.getAttributes())) {
            const fieldDefinition = fields.def.shape[field];
            const predicate = rdfFieldProperties[field];

            if (!fieldDefinition || !predicate) {
                continue;
            }

            for (const object of castToRDF(value, fieldDefinition)) {
                statements.push(new RDFQuad(subject, predicate, object));
            }
        }
    }

    return statements;
}
