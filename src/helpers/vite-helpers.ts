import { bootModels } from '@/models';
import { Model } from '@/models/Model';

function isModelClass(module: unknown): module is typeof Model {
    let prototype = Object.getPrototypeOf(module);

    while (prototype) {
        if (prototype !== Model) {
            prototype = Object.getPrototypeOf(prototype);

            continue;
        }

        return true;
    }

    return false;
}

export function getModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema'],
): Record<string, typeof Model> {
    const models: Record<string, typeof Model> = {};

    for (const [fileName, moduleExports] of Object.entries(glob)) {
        const name = (fileName.match(/^(.*\/)?(.+)\.(j|t)s$/) || [])[2];

        if (typeof name === 'undefined') {
            continue;
        }

        if (ignoreSuffixes.some((suffix) => name.endsWith(suffix))) {
            continue;
        }

        const module = moduleExports['default'] ?? moduleExports[Object.keys(moduleExports)[0] as string];

        if (!module || !isModelClass(module)) {
            continue;
        }

        models[name] = module;
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
