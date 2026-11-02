import { invade } from '@noeldemartin/utils';
import type { MintUrlOptions } from 'soukai-bis/models/Model';
import type Model from 'soukai-bis/models/Model';

/**
 * Models can be wrapped in proxies (for example, by reactivity systems), so this returns the canonical instance in
 * order to compare models by identity.
 */
export function canonicalModel<T extends Model>(model: T): T {
    return invade(model, ['__instance']).__instance() as T;
}

export const mintedUrls = new WeakMap<Model, { url: string; options: MintUrlOptions }>();

export const CLASS_MARKER: unique symbol = Symbol('classMarker');
