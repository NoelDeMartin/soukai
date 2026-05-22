import type Engine from './Engine';
import type ManagesContainers from './contracts/ManagesContainers';
import type PurgesMetadata from './contracts/PurgesMetadata';
import type SolidEngine from './SolidEngine';

export const classMarker: unique symbol = Symbol('classMarker');

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return classMarker in engine.constructor && engine.constructor[classMarker] === 'SolidEngine';
}

export function engineFulfillsContract(
    engine: Engine,
    contract: 'ManagesContainers'
): engine is Engine & ManagesContainers;
export function engineFulfillsContract(engine: Engine, contract: 'PurgesMetadata'): engine is Engine & PurgesMetadata;
export function engineFulfillsContract(engine: Engine, contract: 'ManagesContainers' | 'PurgesMetadata'): boolean {
    switch (contract) {
        case 'ManagesContainers':
            return 'getContainerUrls' in engine && 'dropContainers' in engine;
        case 'PurgesMetadata':
            return 'purgeMetadata' in engine;
    }
}
