import { invade } from '@noeldemartin/utils';
import type { MintUrlOptions } from 'soukai-bis/models/Model';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

export const remoteModels = new WeakMap<ModelConstructor, ModelConstructor>();
export const mintedUrls = new WeakMap<Model, { url: string; options: MintUrlOptions }>();

export const CLASS_MARKER: unique symbol = Symbol('classMarker');

export function canonicalModel<T extends Model>(model: T): T {
    // Models can be wrapped in proxies (for example, by reactivity systems), so this returns the canonical
    // instance in order to compare models by identity.
    return invade(model, ['__instance']).__instance() as T;
}
