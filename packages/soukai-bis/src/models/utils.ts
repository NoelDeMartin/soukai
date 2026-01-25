import type { ModelConstructor } from './types';

export function isModelClass(value: unknown): value is ModelConstructor {
    return typeof value === 'function' && 'schema' in value && '__booted' in value;
}
