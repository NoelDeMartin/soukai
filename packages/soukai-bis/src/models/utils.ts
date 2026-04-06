import type { ModelConstructor } from './types';

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
