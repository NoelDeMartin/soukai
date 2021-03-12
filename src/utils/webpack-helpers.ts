import type { Model } from '@/models/index';

export function modelsFromWebpackContext(
    context: __WebpackModuleApi.RequireContext,
): Record<string, typeof Model> {
    const models = {} as Record<string, typeof Model>;

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.(j|t)s$/) || [])[1];

        if (typeof name !== 'undefined') {
            models[name] = context(fileName).default;
        }
    }

    return models;
}

/**
 * @deprecated Use `modelsFromWebpackContext` instead.
 */
export function definitionsFromContexts(context: __WebpackModuleApi.RequireContext): Record<string, typeof Model> {
    return modelsFromWebpackContext(context);
}
