import type Engine from 'soukai-bis/engines/Engine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';

let asyncContextManager: AsyncContextManager | undefined;

export interface SoukaiAsyncContext {
    engine?: Engine;
    changeTrackingDisabled?: boolean;
}

export interface AsyncContextManager<T = SoukaiAsyncContext> {
    runWithValue<TResult>(value: T, operation: () => TResult): TResult;
    getValue(): T | undefined;
}

export function setAsyncContextManager(manager: AsyncContextManager | undefined): void {
    asyncContextManager = manager;
}

export function getAsyncContext(): SoukaiAsyncContext {
    return asyncContextManager?.getValue() ?? {};
}

export function runWithAsyncContext<T>(context: Partial<SoukaiAsyncContext>, operation: () => T): T {
    if (!asyncContextManager) {
        throw new SoukaiError("Async context manager hasn't been initialized");
    }

    return asyncContextManager.runWithValue({ ...asyncContextManager.getValue(), ...context }, operation);
}
