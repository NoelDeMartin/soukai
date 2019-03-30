import Model from '@/models/Model';

export function definitionsFromContext(context: __WebpackModuleApi.RequireContext): { [name: string]: typeof Model } {
    const models = {};

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.(j|t)s$/) || [])[1];

        if (typeof name !== 'undefined') {
            models[name] = context(fileName).default;
        }
    }

    return models;
}
