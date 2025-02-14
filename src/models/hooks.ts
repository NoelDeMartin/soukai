import type { Model } from './Model';

export type ModelHooks = Partial<Record<'beforeSave' | 'afterSave', (this: Model) => Promise<void> | void>>;
