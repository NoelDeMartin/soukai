import { stringToCamelCase } from '@noeldemartin/utils';

import type Model from './Model';
import type { ModelConstructor, ModelsCache } from './types';

export function isModelClass(value: unknown): value is ModelConstructor {
    return typeof value === 'function' && 'schema' in value && '__engine' in value;
}

export function isModelClassOrSubclass(value: ModelConstructor, target: ModelConstructor): boolean {
    let prototype = value;

    while (prototype) {
        if (prototype !== target) {
            prototype = Object.getPrototypeOf(prototype);
            continue;
        }

        return true;
    }

    return false;
}

export function buildModelsCache(models: Model[]): ModelsCache {
    const modelsCache: ModelsCache = new Map();

    for (const model of models) {
        if (!model.url) {
            continue;
        }

        const classCache = modelsCache.get(model.url) ?? new WeakMap();

        classCache.set(model.static(), model);
        modelsCache.set(model.url, classCache);
    }

    return modelsCache;
}

export function getContainerName(modelName: string): string {
    return `${stringToCamelCase(modelName)}s`;
}
