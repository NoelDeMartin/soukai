/// <reference types="webpack-env" />

import Model from '@/lib/Model';

export function definitionsFromContext(context: __WebpackModuleApi.RequireContext): { [name: string]: typeof Model } {
    const models = {};

    for (const fileName of context.keys()) {
        const name = (fileName.match(/^(?:\.\/)?(.+)\.js$/) || [])[1];
        models[name] = context(fileName).default;
    }

    return models;
}
