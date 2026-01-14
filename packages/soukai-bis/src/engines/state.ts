import { fail } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Engine from './Engine';

let _engine: Engine | undefined;

export function setEngine(engine: Engine): void {
    _engine = engine;
}

export function getEngine(): Engine | undefined {
    return _engine;
}

export function requireEngine(): Engine {
    return _engine ?? fail(SoukaiError, 'Default engine hasn\'t been initialized');
}
