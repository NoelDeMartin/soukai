import { invade } from '@noeldemartin/utils';
import type { NamedNode } from '@rdfjs/types';
import type { MintUrlOptions } from 'soukai-bis/models/Model';
import type Model from 'soukai-bis/models/Model';
import type { Schema } from 'soukai-bis/models/schema';
import type { ModelConstructor } from 'soukai-bis/models/types';

export const remoteModels = new WeakMap<ModelConstructor, ModelConstructor>();
export const migratedModels = new WeakMap<ModelConstructor, WeakMap<ModelConstructor, ModelConstructor>>();
export const originalSchemas = new WeakMap<ModelConstructor, Schema>();
export const mintedUrls = new WeakMap<Model, { url: string; options: MintUrlOptions }>();

export const CLASS_MARKER: unique symbol = Symbol('classMarker');
export const SCHEMA: unique symbol = Symbol('schema');

export function getSchema(modelClass: ModelConstructor): Schema {
    return modelClass[SCHEMA];
}

export function setSchema(modelClass: ModelConstructor, schema: Schema): void {
    modelClass[SCHEMA] = schema;
}

export function getFieldRdfProperties(modelClass: ModelConstructor, field: string): NamedNode[] {
    return getSchema(modelClass).rdfFieldProperties[field] ?? [];
}

export function canonicalModel<T extends Model>(model: T): T {
    // Models can be wrapped in proxies (for example, by reactivity systems), so this returns the canonical
    // instance in order to compare models by identity.
    return invade(model, ['__instance']).__instance() as T;
}
