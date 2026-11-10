import { arrayUnique, invade, required } from '@noeldemartin/utils';
import type Model from 'soukai-bis/models/Model';
import type Relation from 'soukai-bis/models/relations/Relation';

import { isUsingSameDocument } from './rdf';

interface MarkCascadingModelsOptions {
    loadOtherDocumentRelations: boolean;
    deletingUrls?: Set<string>;
}

export interface CascadeDeletesResult {
    markedModels: Model[];
    otherDocumentModels: Model[];
}

async function getCascadingRelations(model: Model, options: MarkCascadingModelsOptions): Promise<Relation[]> {
    const relations: Relation[] = [];

    for (const name of Object.keys(model.static('schema').relations)) {
        const relation = model.getRelation(name);

        if (relation.onDelete !== 'cascade') {
            continue;
        }

        if (!relation.loaded && model.exists() && (relation.usingSameDocument || options.loadOtherDocumentRelations)) {
            await model.loadRelation(name);
        }

        relations.push(relation);
    }

    return relations;
}

function isBeingDeleted(model: Model, deletingUrls?: Set<string>): boolean {
    return model.isMarkedForDeletion() || (!!model.url && model.exists() && !!deletingUrls?.has(model.url));
}

export function markForDeletion(model: Model, deletingUrls?: Set<string>): void {
    model.markForDeletion();

    if (model.url && model.exists()) {
        deletingUrls?.add(model.url);
    }
}

async function markCascadingModels(
    models: Model[],
    options: MarkCascadingModelsOptions,
): Promise<CascadeDeletesResult> {
    const documentUrl = models[0]?.getDocumentUrl() ?? null;
    const pendingModels = [...models];
    const markedModels: Model[] = [];
    const otherDocumentModels = new Set<Model>();

    try {
        while (pendingModels.length > 0) {
            const model = required(pendingModels.pop());

            for (const relation of await getCascadingRelations(model, options)) {
                for (const relatedModel of relation.getLoadedModels()) {
                    if (isBeingDeleted(relatedModel, options.deletingUrls)) {
                        continue;
                    }

                    if (relatedModel.exists() && !isUsingSameDocument(documentUrl, relation, relatedModel)) {
                        otherDocumentModels.add(relatedModel);

                        continue;
                    }

                    markForDeletion(relatedModel, options.deletingUrls);
                    markedModels.push(relatedModel);
                    pendingModels.push(relatedModel);
                }
            }
        }
    } catch (error) {
        markedModels.forEach((model) => model.unmarkForDeletion());

        throw error;
    }

    return { markedModels, otherDocumentModels: Array.from(otherDocumentModels) };
}

export function cascadeDeletes(models: Model[], deletingUrls: Set<string>): Promise<CascadeDeletesResult> {
    return markCascadingModels(models, { loadOtherDocumentRelations: true, deletingUrls });
}

export async function cascadeDeletesInDocument(models: Model[]): Promise<Model[]> {
    const { markedModels } = await markCascadingModels(models, { loadOtherDocumentRelations: false });

    return markedModels;
}

export async function deleteModels(models: Model[], deletingUrls: Set<string> = new Set()): Promise<void> {
    const documentsModels = new Map<string, Model[]>();

    for (const model of models) {
        const documentUrl = model.requireDocumentUrl();

        documentsModels.set(documentUrl, (documentsModels.get(documentUrl) ?? []).concat([model]));
    }

    for (const documentModels of documentsModels.values()) {
        const pendingModels = documentModels.filter(
            (documentModel) => documentModel.exists() && !deletingUrls.has(documentModel.requireUrl()),
        );
        const [model, ...otherModels] = arrayUnique(pendingModels, (pendingModel) => pendingModel.requireUrl());

        if (!model) {
            continue;
        }

        await invade(model, ['performDelete']).performDelete(otherModels, deletingUrls);
    }
}
