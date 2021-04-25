import { engineClosesConnections } from '@/engines/ClosesConnections';
import { fail } from '@noeldemartin/utils';
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

export function requireEngine(): Engine {
    return _engine || fail(
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

export async function closeEngineConnections(): Promise<void> {
    if (!_engine || !engineClosesConnections(_engine))
        return;

    await _engine.closeConnections();
}
