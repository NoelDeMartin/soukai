import type Engine from './Engine';
import type SolidEngine from './SolidEngine';

export const classMarker: unique symbol = Symbol('classMarker');

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return classMarker in engine.constructor && engine.constructor[classMarker] === 'SolidEngine';
}
