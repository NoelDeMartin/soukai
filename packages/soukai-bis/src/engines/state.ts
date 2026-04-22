import { fail } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';

import { engineFulfillsContract } from './utils';
import type Engine from './Engine';
import type ManagesContainers from './contracts/ManagesContainers';

let _engine: Engine | undefined;
let _asyncContextManager: AsyncContextManager<Engine> | undefined;

export interface AsyncContextManager<T> {
    runWithValue<TResult>(value: T, operation: () => TResult): TResult;
    getValue(): T | undefined;
}

export function setAsyncContextManager(manager: AsyncContextManager<Engine>): void {
    _asyncContextManager = manager;
}

export function setEngine(engine: Engine): void {
    _engine = engine;
}

export function runWithEngine<T>(engine: Engine, operation: () => T): T {
    if (!_asyncContextManager) {
        throw new SoukaiError('Async context manager hasn\'t been initialized');
    }

    return _asyncContextManager.runWithValue(engine, operation);
}

export function getEngine(): Engine | undefined {
    return _asyncContextManager?.getValue() ?? _engine;
}

export function requireEngine(): Engine;
export function requireEngine(contract: 'ManagesContainers'): Engine & ManagesContainers;
export function requireEngine(contract?: 'ManagesContainers'): Engine {
    const engine = getEngine() ?? fail<never>(SoukaiError, 'Default engine hasn\'t been initialized');

    if (contract && !engineFulfillsContract(engine, contract)) {
        throw new SoukaiError(
            `Engine ${engine.static().engineName} does not fulfill the required contrac: ${contract}.`,
        );
    }

    return engine;
}
