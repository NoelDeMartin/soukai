import type Engine from './Engine';
import type ManagesContainers from './contracts/ManagesContainers';
import type SolidEngine from './SolidEngine';

export const classMarker: unique symbol = Symbol('classMarker');

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return classMarker in engine.constructor && engine.constructor[classMarker] === 'SolidEngine';
}

export function engineFulfillsContract(
    engine: Engine,
    contract: 'ManagesContainers', // eslint-disable-line @typescript-eslint/no-unused-vars
): engine is Engine & ManagesContainers {
    return 'getContainerUrls' in engine && 'dropContainers' in engine;
}
