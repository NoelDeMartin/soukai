import { bootModels } from '@/models';
import type { Model } from '@/models';

/**
 * @deprecated This was intended for loading models, but that isn't necessary anymore. Maybe you want to use
 * `bootModelsFromWebpackContext` instead.
 */
export function definitionsFromContexts(context: __WebpackModuleApi.RequireContext): Record<string, typeof Model> {
    return getModelsFromWebpackContext(context);
}

export function getModelsFromWebpackContext(
    context: __WebpackModuleApi.RequireContext,
    ignoreSuffixes: string[] = ['.schema', '.test'],
): Record<string, typeof Model> {
    const models = {} as Record<string, typeof Model>;

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.(j|t)s$/) || [])[1];

        if (typeof name === 'undefined')
            continue;

        if (ignoreSuffixes.some(suffix => name.endsWith(suffix)))
            continue;

        models[name] = context(fileName).default;
    }

    return models;
}

export function bootModelsFromWebpackContext(
    context: __WebpackModuleApi.RequireContext,
    ignoreSuffixes: string[] = ['.schema'],
): void {
    const models = getModelsFromWebpackContext(context, ignoreSuffixes);

    bootModels(models);
}
