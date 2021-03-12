import { objectHasOwnProperty } from '@noeldemartin/utils';
import type { Model } from '@/models/Model';

const _bootedModels: Record<string, typeof Model> = {};

export function isModelBooted(model: typeof Model): boolean {
    return Object.values(_bootedModels).includes(model);
}

export function getModel(name: string): typeof Model {
    return _bootedModels[name];
}

export function loadModel(name: string, model: typeof Model): void {
    if (isModelBooted(model))
        return;

    model.boot(name);
    _bootedModels[name] = model;
}

export function loadModels(models: Record<string, typeof Model>): void {
    for (const name in models) {
        if (! objectHasOwnProperty(models, name))
            continue;

        loadModel(name, models[name]);
    }
}
