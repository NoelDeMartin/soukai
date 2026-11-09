import type { SolidDocument } from '@noeldemartin/solid-utils';
import { invade, tap, weakMemo } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type { MintUrlOptions } from 'soukai-bis/models/Model';
import type Model from 'soukai-bis/models/Model';

export const quadsSourceDocumentUrls = new WeakMap<Quad[], string>();
export const mintedUrls = new WeakMap<Model, { url: string; options: MintUrlOptions }>();

export const CLASS_MARKER: unique symbol = Symbol('classMarker');

export function canonicalModel<T extends Model>(model: T): T {
    // Models can be wrapped in proxies (for example, by reactivity systems), so this returns the canonical
    // instance in order to compare models by identity.
    return invade(model, ['__instance']).__instance() as T;
}

export function getDocumentQuads(document: SolidDocument): Quad[] {
    return weakMemo('document-quads', document, () =>
        tap(document.getQuads(), (quads) => quadsSourceDocumentUrls.set(quads, document.url)),
    );
}
