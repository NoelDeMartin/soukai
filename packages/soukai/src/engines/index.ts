import { engineClosesConnections } from 'soukai/engines/ClosesConnections';
import { fail, tap } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai/errors';
import type { Engine } from 'soukai/engines/Engine';

import { isProxyEngine } from './ProxyEngine';

export * from './ClosesConnections';
export * from './Engine';
export * from './EngineHelper';
export * from './IndexedDBEngine';
export * from './InMemoryEngine';
export * from './LocalStorageEngine';
export * from './LogEngine';
export * from './ProxyEngine';

let _engine: Engine | undefined = undefined;

export function extractFinalEngine(engine: Engine): Engine {
    while (engine && isProxyEngine(engine)) {
        engine = engine.getProxySubject();
    }

    return engine;
}

export function getEngine(): Engine | undefined {
    return _engine;
}

export function getFinalEngine(): Engine | undefined {
    return _engine && extractFinalEngine(_engine);
}

export function requireEngine<T extends Engine = Engine>(): T {
    return (
        (_engine as T) ||
        fail(
            SoukaiError,
            'Engine must be initialized before performing any operations. ' +
                'Learn more at https://soukai.js.org/guide/core-concepts/engines.html',
        )
    );
}

export function requireFinalEngine<T extends Engine = Engine>(): T {
    return (
        (getFinalEngine() as T) ||
        fail(
            SoukaiError,
            'Engine must be initialized before performing any operations. ' +
                'Learn more at https://soukai.js.org/guide/core-concepts/engines.html',
        )
    );
}

export function setEngine(engine: Engine | null): void {
    if (!engine) {
        _engine = undefined;

        return;
    }

    _engine = engine;
}

export function withEngine<T>(engine: Engine, operation: () => T): T;
export function withEngine<T>(engine: Engine, operation: () => Promise<T>): Promise<T>;
export function withEngine<T>(engine: Engine, operation: () => T | Promise<T>): T | Promise<T> {
    const originalEngine = _engine ?? null;

    setEngine(engine);

    const result = operation();

    return result instanceof Promise
        ? result.then(() => tap(result, () => setEngine(originalEngine)))
        : tap(result, () => setEngine(originalEngine));
}

export async function closeEngineConnections(): Promise<void> {
    if (!_engine || !engineClosesConnections(_engine)) return;

    await _engine.closeConnections();
}
