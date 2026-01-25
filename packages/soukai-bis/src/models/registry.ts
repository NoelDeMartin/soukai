import { fail } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';

import { isModelClass } from './utils';
import type Model from './Model';
import type { ModelConstructor } from './types';

const bootedModels: Map<string, ModelConstructor> = new Map();

export interface ModelsRegistry {}

export function getModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema', '.test'],
): Record<string, ModelConstructor> {
    const models: Record<string, ModelConstructor> = {};

    for (const [fileName, moduleExports] of Object.entries(glob)) {
        const name = (fileName.match(/^(.*\/)?(.+)\.(j|t)s$/) || [])[2];

        if (typeof name === 'undefined') {
            continue;
        }

        if (ignoreSuffixes.some((suffix) => name.endsWith(suffix))) {
            continue;
        }

        const module = moduleExports['default'] ?? moduleExports[Object.keys(moduleExports)[0] as string];

        if (!module || !isModelClass(module)) {
            continue;
        }

        models[name] = module;
    }

    return models;
}

export function requireBootedModel<T extends keyof ModelsRegistry>(name: T): ModelsRegistry[T];
export function requireBootedModel<T extends ModelConstructor<Model> = ModelConstructor<Model>>(name: string): T;
export function requireBootedModel(name: string): ModelConstructor {
    return (
        bootedModels.get(name) ??
        fail(SoukaiError, `Could not find Model with name '${name}', are you sure it's booted?`)
    );
}

export function bootModels(
    models: Record<string, { boot(name: string): unknown; reset(): void }>,
    reset: boolean = false,
): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        reset && modelClass.reset();

        modelClass.boot(modelName);
        bootedModels.set(modelName, modelClass as ModelConstructor);
    }
}

export function bootModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema'],
): void {
    const models = getModelsFromViteGlob(glob, ignoreSuffixes);

    bootModels(models);
}
