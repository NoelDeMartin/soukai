import { bootModels } from 'soukai/models';
import type { Model } from 'soukai/models/Model';

export function getModelsFromWebpackContext(
    context: __WebpackModuleApi.RequireContext,
    ignoreSuffixes: string[] = ['.schema', '.test'],
): Record<string, typeof Model> {
    const models = {} as Record<string, typeof Model>;

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.(j|t)s$/) || [])[1];

        if (typeof name === 'undefined') continue;

        if (ignoreSuffixes.some((suffix) => name.endsWith(suffix))) continue;

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
