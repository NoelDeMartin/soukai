import { stringToCamelCase, tap } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type { ModelConstructor } from 'soukai-bis/models/types';

const store = new WeakMap<ModelConstructor, ModelMeta>();

export interface ModelMeta {
    defaultContainerUrl: string;
    modelName: string;
}

function initMeta(model: ModelConstructor, name?: string): ModelMeta {
    name ??= model.name;

    return tap(
        {
            modelName: name,
            defaultContainerUrl: `solid://${stringToCamelCase(name)}s/`,
        },
        (meta) => store.set(model, meta),
    );
}

export function getMeta<T extends keyof ModelMeta>(model: ModelConstructor, property: T): ModelMeta[T] {
    return (store.get(model) ?? initMeta(model))[property];
}

export function setMeta<T extends keyof ModelMeta>(model: ModelConstructor, property: T, value: ModelMeta[T]): void {
    const meta = store.get(model) ?? initMeta(model);

    meta[property] = value;
}

export function isBooted(model: ModelConstructor): boolean {
    return store.has(model);
}

export function boot(model: ModelConstructor, name?: string): void {
    if (isBooted(model)) {
        throw new SoukaiError(`${getMeta(model, 'modelName')} model already booted`);
    }

    initMeta(model, name);
}

export function reset(model: ModelConstructor): void {
    store.delete(model);
}
