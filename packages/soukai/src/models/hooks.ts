import type { Model } from './Model';

export interface ModelHooks {
    beforeSave?: (this: Model) => Promise<void> | void;
    afterSave?: (this: Model) => Promise<void> | void;
    afterInitialize?: (this: Model) => void;
}
