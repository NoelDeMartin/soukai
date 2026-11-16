import { fail } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';

import type Engine from './Engine';
import type LocalEngine from './LocalEngine';
import type SolidEngine from './SolidEngine';
import { isLocalEngine, isSolidEngine } from './utils';

let defaultEngine: Engine | undefined;
let remoteEngine: SolidEngine | null = null;
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

export function setRemoteEngine(engine: SolidEngine | null): void {
    remoteEngine = engine;
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

export function requireEngine(): Engine {
    return getEngine() ?? fail<never>(SoukaiError, "Default engine hasn't been initialized");
}

export function getRemoteEngine(): SolidEngine | undefined {
    if (remoteEngine) {
        return remoteEngine;
    }

    const engine = getEngine();

    return engine && isSolidEngine(engine) ? engine : undefined;
}

export function requireRemoteEngine(): SolidEngine {
    return (
        getRemoteEngine() ??
        fail<never>(
            SoukaiError,
            "Remote engine hasn't been initialized, call setRemoteEngine() with a SolidEngine " +
                "if the default engine isn't one",
        )
    );
}

export function getLocalEngine(): LocalEngine | undefined {
    const engine = getEngine();

    return engine && isLocalEngine(engine) ? engine : undefined;
}

export function requireLocalEngine(): LocalEngine {
    return (
        getLocalEngine() ??
        fail<never>(SoukaiError, 'A local engine is not available, call setEngine() with a LocalEngine')
    );
}
