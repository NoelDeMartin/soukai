import type { MintUrlOptions } from 'soukai-bis/models/Model';
import type Model from 'soukai-bis/models/Model';

export const mintedUrls = new WeakMap<Model, { url: string; options: MintUrlOptions }>();

export const CLASS_MARKER: unique symbol = Symbol('classMarker');
