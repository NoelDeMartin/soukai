import SoukaiError from 'soukai-bis/errors/SoukaiError';

import type Engine from './Engine';
import type ManagesContainers from './contracts/ManagesContainers';
import type SolidEngine from './SolidEngine';

export const classMarker: unique symbol = Symbol('classMarker');

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return classMarker in engine.constructor && engine.constructor[classMarker] === 'SolidEngine';
}

export function engineManagesContainers(engine: Engine): engine is Engine & ManagesContainers {
    return 'getContainerUrls' in engine && 'dropContainers' in engine;
}

export function requireEngineContract(engine: Engine, contract: 'ManagesContainers'): Engine & ManagesContainers {
    if (!engineManagesContainers(engine)) {
        throw new SoukaiError(
            `Engine ${engine.static().engineName} does not fulfill the required contrac: ${contract}.`,
        );
    }

    return engine;
}
