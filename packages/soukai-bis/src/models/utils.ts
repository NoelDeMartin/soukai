import type { ModelConstructor } from 'soukai-bis/models/types';

export function bootModels(
    models: Record<string, { boot(name: string): unknown; reset(): void }>,
    reset: boolean = false,
): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        reset && modelClass.reset();

        modelClass.boot(modelName);
    }
}

export function isModelClass(value: unknown): value is ModelConstructor {
    return typeof value === 'function' && 'schema' in value && '__booted' in value;
}
