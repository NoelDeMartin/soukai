import { invade, isArray, required } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import { isMultiModelRelation, isSingleModelRelation } from 'soukai-bis/models/relations/helpers';
import type Relation from 'soukai-bis/models/relations/Relation';
import type { LegacyTimestamps } from 'soukai-bis/models/types';

export interface SerializedRelation {
    related?: number | number[] | null;
    documentModelsLoaded: boolean;
    modelInSameDocument?: number;
    modelInOtherDocumentId?: string;
    modelsInSameDocument?: number[];
    modelsInOtherDocumentIds?: string[];
}

export interface SerializedModelNode {
    modelName: string;
    attributes: Record<string, unknown>;
    exists: boolean;
    documentExists: boolean;
    legacyTimestamps: LegacyTimestamps;
    relations: Record<string, SerializedRelation>;
}

export interface SerializedModel {
    nodes: SerializedModelNode[];
}

function invaded(model: Model) {
    return invade(model, ['_relations', '_legacyTimestamps', 'restoreComputedAttributes']);
}

function nullOrUndefined(value: unknown): null | undefined {
    return value === null ? null : undefined;
}

function hasRelationState(relation: Relation): boolean {
    if (relation.loaded || relation.documentModelsLoaded) {
        return true;
    }

    if (isSingleModelRelation(relation)) {
        return !!(relation.__modelInSameDocument || relation.__modelInOtherDocumentId);
    }

    if (isMultiModelRelation(relation)) {
        return !!(relation.__modelsInSameDocument || relation.__modelsInOtherDocumentIds);
    }

    return false;
}

function serializeModelNode(
    model: Model,
    serialized: SerializedModel,
    indexes: Map<Model, number>,
    relationNames?: string[],
): number {
    const existingIndex = indexes.get(model);

    if (existingIndex !== undefined) {
        return existingIndex;
    }

    if (model.isDirty(undefined, true)) {
        throw new SoukaiError(`Can't serialize dirty ${model.static().modelName} model, save it first`);
    }

    const index = serialized.nodes.length;
    const node: SerializedModelNode = {
        modelName: model.static().modelName,
        attributes: model.getAttributes(),
        exists: model.exists(),
        documentExists: model.documentExists(),
        legacyTimestamps: invaded(model)._legacyTimestamps,
        relations: {},
    };

    indexes.set(model, index);
    serialized.nodes.push(node);

    for (const [name, relation] of Object.entries(invaded(model)._relations)) {
        if ((relationNames && !relationNames.includes(name)) || !hasRelationState(relation)) {
            continue;
        }

        node.relations[name] = serializeRelation(relation, serialized, indexes);
    }

    return index;
}

function serializeRelation(
    relation: Relation,
    serialized: SerializedModel,
    indexes: Map<Model, number>,
): SerializedRelation {
    const serializedRelation: SerializedRelation = { documentModelsLoaded: relation.documentModelsLoaded };
    const serializeRelatedModel = (model: Model) => serializeModelNode(model, serialized, indexes);
    const serializeOptionalModel = (model?: Model | null) => (model ? serializeRelatedModel(model) : undefined);
    const serializeOptionalModels = (models?: Model[]) => models?.map(serializeRelatedModel);

    if (isSingleModelRelation(relation)) {
        const related = relation.related;

        if (related !== undefined) {
            serializedRelation.related = related && serializeRelatedModel(related);
        }

        serializedRelation.modelInSameDocument = serializeOptionalModel(relation.__modelInSameDocument);
        serializedRelation.modelInOtherDocumentId = relation.__modelInOtherDocumentId;
    }

    if (isMultiModelRelation(relation)) {
        const related = relation.related;

        if (related !== undefined) {
            serializedRelation.related = related && related.map(serializeRelatedModel);
        }

        serializedRelation.modelsInSameDocument = serializeOptionalModels(relation.__modelsInSameDocument);
        serializedRelation.modelsInOtherDocumentIds = relation.__modelsInOtherDocumentIds;
    }

    return serializedRelation;
}

function requireHydratedModel(models: Model[], index: number): Model {
    return required(models[index], `Serialized model with index ${index} is missing`);
}

function hydrateRelation(relation: Relation, serialized: SerializedRelation, models: Model[]): void {
    const hydrateOptionalModel = (index?: number) =>
        index === undefined ? undefined : requireHydratedModel(models, index);
    const hydrateOptionalModels = (indexes?: number[]) => indexes?.map((index) => requireHydratedModel(models, index));
    const related = serialized.related;

    if (isSingleModelRelation(relation)) {
        relation.__newModel = undefined;
        relation.related =
            typeof related === 'number' ? requireHydratedModel(models, related) : nullOrUndefined(related);
        relation.__modelInSameDocument = hydrateOptionalModel(serialized.modelInSameDocument);
        relation.__modelInOtherDocumentId = serialized.modelInOtherDocumentId;
    }

    if (isMultiModelRelation(relation)) {
        relation.__newModels = undefined;
        relation.related = isArray(related) ? hydrateOptionalModels(related) : nullOrUndefined(related);
        relation.__modelsInSameDocument = hydrateOptionalModels(serialized.modelsInSameDocument);
        relation.__modelsInOtherDocumentIds = serialized.modelsInOtherDocumentIds;
    }

    relation.documentModelsLoaded = serialized.documentModelsLoaded;
}

async function hydrateModels(
    serialized: SerializedModel,
    root?: Model,
): Promise<{ models: Model[]; rootRelations: Relation[] }> {
    const rootRelations: Relation[] = [];
    const models = serialized.nodes.map((node, index) =>
        root && index === 0
            ? root
            : requireBootedModel(node.modelName).newInstance(node.attributes, { exists: node.exists }),
    );

    serialized.nodes.forEach((node, index) => {
        const model = requireHydratedModel(models, index);

        for (const [name, serializedRelation] of Object.entries(node.relations)) {
            const relation = model.getRelation(name);

            if (model === root && relation.loaded) {
                continue;
            }

            hydrateRelation(relation, serializedRelation, models);

            if (model === root && relation.loaded) {
                rootRelations.push(relation);
            }
        }
    });

    serialized.nodes.forEach((node, index) => {
        const model = requireHydratedModel(models, index);

        if (model === root) {
            return;
        }

        model.setDocumentExists(node.documentExists);
        invaded(model)._legacyTimestamps = node.legacyTimestamps;
    });

    await Promise.all(models.map((model) => invaded(model).restoreComputedAttributes()));

    return { models, rootRelations };
}

export function serializeModel(model: Model, options: { relations?: string[] } = {}): SerializedModel {
    const serialized: SerializedModel = { nodes: [] };

    serializeModelNode(model, serialized, new Map(), options.relations);

    return serialized;
}

export async function hydrateModel(serialized: SerializedModel): Promise<Model> {
    const { models } = await hydrateModels(serialized);

    return requireHydratedModel(models, 0);
}

export async function hydrateModelRelations(model: Model, serialized: SerializedModel): Promise<Relation[]> {
    const rootNode = serialized.nodes[0];

    if (rootNode?.modelName !== model.static().modelName || rootNode.attributes.url !== model.url) {
        throw new SoukaiError(
            `Failed hydrating ${model.static().modelName} relations, serialized model doesn't match ${model.url}`,
        );
    }

    const { rootRelations } = await hydrateModels(serialized, model);

    return rootRelations;
}
