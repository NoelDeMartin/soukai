import { RDFNamedNode } from '@noeldemartin/solid-utils';
import { fail } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';

import { getSchema } from './internals/model';
import RDFClassesMatcher from './matching/RDFClassesMatcher';
import type Model from './Model';
import type { Schema } from './schema';
import type { ModelConstructor } from './types';
import { isModelClass } from './utils';

const bootedModels: Map<string, ModelConstructor> = new Map();

function replacePrefix(iri: string, entries: [string, string][]): string | null {
    for (const [source, target] of entries) {
        if (!iri.startsWith(source)) {
            continue;
        }

        return `${target}${iri.slice(source.length)}`;
    }

    return null;
}

export interface ModelsRegistry {}

export interface BootOptions {
    reset?: boolean;
}

export function getModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    ignoreSuffixes: string[] = ['.schema', '.test'],
): Record<string, ModelConstructor> {
    const models: Record<string, ModelConstructor> = {};

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

export function requireBootedModel<T extends keyof ModelsRegistry>(name: T): ModelsRegistry[T];
export function requireBootedModel<T extends ModelConstructor<Model> = ModelConstructor<Model>>(name: string): T;
export function requireBootedModel(name: string): ModelConstructor {
    return (
        bootedModels.get(name) ??
        fail(SoukaiError, `Could not find Model with name '${name}', are you sure it's booted?`)
    );
}

export function getBootedModels(): Map<string, ModelConstructor> {
    return new Map(bootedModels);
}

export function bootModels(
    models: Record<string, { boot(name: string): unknown; reset(): void }>,
    options: BootOptions = {},
): void {
    for (const [modelName, modelClass] of Object.entries(models)) {
        options.reset && modelClass.reset();

        modelClass.boot(modelName);
        bootedModels.set(modelName, modelClass as ModelConstructor);
    }
}

export function bootModelsFromViteGlob(
    glob: Record<string, Record<string, unknown>>,
    options: BootOptions & { ignoreSuffixes?: string[] } = {},
): void {
    const { ignoreSuffixes, ...bootOptions } = options;
    const suffixes = ignoreSuffixes ?? ['.schema'];
    const models = getModelsFromViteGlob(glob, suffixes);

    bootModels(models, bootOptions);
}

export function replaceRDFPrefixes(replacements: Record<string, string>): void {
    const entries = Object.entries(replacements).filter(([source, target]) => source && target && source !== target);

    if (entries.length === 0) {
        return;
    }

    const seenSchemas = new Set<Schema>();

    for (const modelClass of bootedModels.values()) {
        const schema = getSchema(modelClass);

        if (seenSchemas.has(schema)) {
            continue;
        }

        seenSchemas.add(schema);

        for (const [alias, prefix] of Object.entries(schema.rdfContext)) {
            const replaced = replacePrefix(prefix, entries);

            if (replaced) {
                schema.rdfContext[alias] = replaced;
            }
        }

        schema.rdfClasses = new RDFClassesMatcher(
            schema.rdfClasses.match,
            schema.rdfClasses.classes.map((rdfClass) => {
                const replaced = replacePrefix(rdfClass.value, entries);

                return replaced ? new RDFNamedNode(replaced) : rdfClass;
            }),
        );

        for (const [field, properties] of Object.entries(schema.rdfFieldProperties)) {
            schema.rdfFieldProperties[field] = properties.map((property) => {
                const replaced = replacePrefix(property.value, entries);

                return replaced ? new RDFNamedNode(replaced) : property;
            });
        }
    }
}
