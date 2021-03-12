import type { Model } from '@/models/index';

/**
 * @deprecated This was intended for loading models, but that isn't necessary anymore. If you're using this method
 * for something else, let me know here because I'm planning to remove this in an upcoming release:
 * https://github.com/NoelDeMartin/soukai/issues/
 */
export function definitionsFromContexts(context: __WebpackModuleApi.RequireContext): Record<string, typeof Model> {
    const models = {} as Record<string, typeof Model>;

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.(j|t)s$/) || [])[1];

        if (typeof name !== 'undefined') {
            models[name] = context(fileName).default;
        }
    }

    return models;
}
