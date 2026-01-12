import { fail } from '@noeldemartin/utils';
import type { Engine } from './Engine';

let _engine: Engine | undefined;

export function setEngine(engine: Engine): void {
    _engine = engine;
}

export function getEngine(): Engine | undefined {
    return _engine;
}

export function requireEngine(): Engine {
    return _engine ?? fail('Default engine hasn\'t been initialized');
}
