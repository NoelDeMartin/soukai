import { fail } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';

import type ManagesContainers from './contracts/ManagesContainers';
import type PurgesMetadata from './contracts/PurgesMetadata';
import type Engine from './Engine';
import { engineFulfillsContract } from './utils';

let defaultEngine: Engine | undefined;
let asyncContextManager: AsyncContextManager<Engine> | undefined;

export interface AsyncContextManager<T> {
    runWithValue<TResult>(value: T, operation: () => TResult): TResult;
    getValue(): T | undefined;
}

export function setAsyncContextManager(manager: AsyncContextManager<Engine>): void {
    asyncContextManager = manager;
}

export function setEngine(engine: Engine): void {
    defaultEngine = engine;
}

export function runWithEngine<T>(engine: Engine, operation: () => T): T {
    if (!asyncContextManager) {
        throw new SoukaiError("Async context manager hasn't been initialized");
    }

    return asyncContextManager.runWithValue(engine, operation);
}

export function getEngine(): Engine | undefined {
    return asyncContextManager?.getValue() ?? defaultEngine;
}

export function requireEngine(): Engine;
export function requireEngine(contract: 'ManagesContainers'): Engine & ManagesContainers;
export function requireEngine(contract: 'PurgesMetadata'): Engine & PurgesMetadata;
export function requireEngine(contract?: string): Engine {
    const engine = getEngine() ?? fail<never>(SoukaiError, "Default engine hasn't been initialized");

    if (contract && !engineFulfillsContract(engine, contract as 'ManagesContainers')) {
        throw new SoukaiError(
            `Engine ${engine.static().engineName} does not fulfill the required contrac: ${contract}.`,
        );
    }

    return engine;
}
