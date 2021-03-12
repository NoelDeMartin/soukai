import { bootModels } from '@/models';
import type { Model } from '@/models';

declare global {

    interface ImportMeta {
        globEager(path: string): Record<string, { default: typeof Model }>;
    }

}

export function getModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema'],
): Record<string, typeof Model> {
    const models: Record<string, typeof Model> = {};

    for (const [fileName, moduleExports] of Object.entries(glob)) {
        const name = (fileName.match(/^(.*\/)?(.+)\.(j|t)s$/) || [])[2];

        if (typeof name === 'undefined')
            continue;

        if (ignoreSuffixes.some(suffix => name.endsWith(suffix)))
            continue;

        models[name] = (moduleExports['default'] ?? moduleExports[Object.keys(moduleExports)[0]]) as typeof Model;
    }

    return models;
}

export function bootModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema'],
): void {
    const models = getModelsFromViteGlob(glob, ignoreSuffixes);

    bootModels(models);
}
