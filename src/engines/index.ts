import { engineClosesConnections } from '@/engines/ClosesConnections';
import { fail, tap } from '@noeldemartin/utils';
import { SoukaiError } from '@/errors';
import type { Engine } from '@/engines/Engine';

export * from './ClosesConnections';
export * from './Engine';
export * from './EngineHelper';
export * from './IndexedDBEngine';
export * from './InMemoryEngine';
export * from './LocalStorageEngine';
export * from './LogEngine';

let _engine: Engine | undefined = undefined;

export function getEngine(): Engine | undefined {
    return _engine;
}

export function requireEngine<T extends Engine = Engine>(): T {
    return _engine as T || fail(
        SoukaiError,
        'Engine must be initialized before performing any operations. ' +
            'Learn more at https://soukai.js.org/guide/engines.html',
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
    if (!_engine || !engineClosesConnections(_engine))
        return;

    await _engine.closeConnections();
}
