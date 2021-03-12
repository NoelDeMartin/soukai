import type { Model } from '@/models';

declare global {

    interface ImportMeta {
        globEager(path: string): Record<string, { default: typeof Model }>;
    }

}

export function modelsFromViteGlob(
    files: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema'],
): Record<string, typeof Model> {
    const models: Record<string, typeof Model> = {};

    for (const [fileName, modelClass] of Object.entries(files)) {
        const name = (fileName.match(/^(.*\/)?(.+)\.(j|t)s$/) || [])[2];

        if (typeof name === 'undefined')
            continue;

        if (ignoreSuffixes.some(suffix => name.endsWith(suffix)))
            continue;

        models[name] = (modelClass['default'] ?? modelClass[Object.keys(modelClass)[0]]) as typeof Model;
    }

    return models;
}
