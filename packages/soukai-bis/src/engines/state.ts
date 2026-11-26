import { fail } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getAsyncContext, runWithAsyncContext } from 'soukai-bis/lib/context';

import type Engine from './Engine';
import type LocalEngine from './LocalEngine';
import type SolidEngine from './SolidEngine';
import { isLocalEngine, isSolidEngine } from './utils';

let defaultEngine: Engine | undefined;
let remoteEngine: SolidEngine | null = null;

export function setEngine(engine: Engine): void {
    defaultEngine = engine;
}

export function setRemoteEngine(engine: SolidEngine | null): void {
    remoteEngine = engine;
}

export function runWithEngine<T>(engine: Engine, operation: () => T): T {
    return runWithAsyncContext({ engine }, operation);
}

export function getEngine(): Engine | undefined {
    return getAsyncContext().engine ?? defaultEngine;
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
