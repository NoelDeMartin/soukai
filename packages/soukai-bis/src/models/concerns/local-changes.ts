import type Engine from 'soukai-bis/engines/Engine';
import { mergeLocalChanges, resourceLocalChanges, withoutResourceLocalChanges } from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import type { DocumentLocalChanges, LocalChangesUpdate } from 'soukai-bis/engines/LocalEngine';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { tracksLocalChanges } from 'soukai-bis/models/local-changes';
import type Model from 'soukai-bis/models/Model';
import type { ModelWithUrl } from 'soukai-bis/models/types';

export function recordsLocalChanges(model: Model, engine: LocalEngine | null): boolean {
    return !!engine && tracksLocalChanges(model.static());
}

export function isCreatedLocally(model: ModelWithUrl, changes: DocumentLocalChanges | null): boolean {
    return changes?.resources[model.url]?.state === 'created';
}

export function isDeletedLocally(model: Model, changes: DocumentLocalChanges | null): boolean {
    return !!model.url && changes?.resources[model.url]?.state === 'deleted';
}

export function assertRestorableModels(models: Model[]): void {
    for (const model of models) {
        if (model.tracksChanges()) {
            continue;
        }

        throw new SoukaiError(
            `Can't create ${model.static('modelName')} model (${model.url}), it was deleted locally and synced ` +
                'models without history are immutable (they can only be created and deleted).',
        );
    }
}

export function assertMutableModels(models: Model[], engine: Engine | undefined): void {
    const localEngine = engine && isLocalEngine(engine) ? engine : null;

    for (const model of models) {
        if (
            !recordsLocalChanges(model, localEngine) ||
            !model.exists() ||
            model.isMarkedForDeletion() ||
            model.tracksChanges() ||
            model.requireUrl().endsWith('/')
        ) {
            continue;
        }

        throw new SoukaiError(
            `Can't update ${model.static('modelName')} model (${model.url}), synced models without history are ` +
                'immutable (they can only be created and deleted).',
        );
    }
}

export function createdModelsLocalChanges(models: Model[]): LocalChangesUpdate | undefined {
    const createdUrls = models
        .filter((model) => tracksLocalChanges(model.static()) && !model.isMarkedForDeletion() && model.url)
        .map((model) => model.requireUrl());

    if (createdUrls.length === 0) {
        return undefined;
    }

    return (changes) =>
        mergeLocalChanges(changes, {
            resources: Object.fromEntries(createdUrls.map((url) => [url, { state: 'created' }])),
        });
}

export function updatedModelsLocalChanges({
    updatedModels,
    removedModels,
    restoredModels,
    newOperations,
    deletedOperations,
}: {
    updatedModels: Model[];
    removedModels: ModelWithUrl[];
    restoredModels: Model[];
    newOperations: Map<string, string[]>;
    deletedOperations: Map<string, string[]>;
}): LocalChangesUpdate | undefined {
    const additions: DocumentLocalChanges = { resources: {} };
    const removedUrls = removedModels.filter((model) => tracksLocalChanges(model.static())).map((model) => model.url);
    const restoredUrls = restoredModels.map((model) => model.requireUrl());

    for (const model of updatedModels) {
        if (!tracksLocalChanges(model.static()) || !model.url) {
            continue;
        }

        if (restoredModels.includes(model)) {
            const operations = newOperations.get(model.url) ?? [];

            if (operations.length > 0) {
                additions.resources[model.url] = { state: 'updated', newOperations: operations };
            }

            continue;
        }

        if (!model.exists()) {
            additions.resources[model.url] = { state: 'created' };

            continue;
        }

        if (model.tracksChanges()) {
            const operations = newOperations.get(model.url) ?? [];

            if (operations.length > 0) {
                additions.resources[model.url] = { state: 'updated', newOperations: operations };
            }

            continue;
        }

        if (model.url.endsWith('/')) {
            additions.resources[model.url] = { state: 'updated' };
        }
    }

    for (const [url, operations] of deletedOperations) {
        additions.resources[url] = resourceLocalChanges('deleted', [], operations);
    }

    if (Object.keys(additions.resources).length === 0 && removedUrls.length === 0 && restoredUrls.length === 0) {
        return undefined;
    }

    return (changes) => {
        const merged = mergeLocalChanges(
            changes && withoutResourceLocalChanges(changes, new Set(restoredUrls)),
            additions,
        );

        for (const url of removedUrls) {
            delete merged.resources[url];
        }

        return merged;
    };
}
