import type ManagesContainers from './contracts/ManagesContainers';
import type ManagesDocuments from './contracts/ManagesDocuments';
import type PurgesMetadata from './contracts/PurgesMetadata';
import type Engine from './Engine';
import { CLASS_MARKER } from './internals';
import type SolidEngine from './SolidEngine';

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return CLASS_MARKER in engine.constructor && engine.constructor[CLASS_MARKER] === 'SolidEngine';
}

export function engineFulfillsContract(
    engine: Engine,
    contract: 'ManagesContainers',
): engine is Engine & ManagesContainers;
export function engineFulfillsContract(
    engine: Engine,
    contract: 'ManagesDocuments',
): engine is Engine & ManagesDocuments;
export function engineFulfillsContract(engine: Engine, contract: 'PurgesMetadata'): engine is Engine & PurgesMetadata;
export function engineFulfillsContract(
    engine: Engine,
    contract: 'ManagesContainers' | 'PurgesMetadata' | 'ManagesDocuments',
): boolean {
    switch (contract) {
        case 'ManagesContainers':
            return 'getContainerUrls' in engine && 'dropContainers' in engine;
        case 'PurgesMetadata':
            return 'purgeMetadata' in engine;
        case 'ManagesDocuments':
            return 'getDocumentUrls' in engine;
    }
}
