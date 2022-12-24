import type { Engine } from '@/engines/Engine';

export function isProxyEngine(engine: Engine): engine is Engine & ProxyEngine {
    return 'getProxySubject' in engine;
}

export interface ProxyEngine {

    getProxySubject(): Engine;

}
