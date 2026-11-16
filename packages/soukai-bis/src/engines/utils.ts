import type Engine from './Engine';
import { CLASS_MARKER } from './internals';
import type LocalEngine from './LocalEngine';
import type SolidEngine from './SolidEngine';

export function isSolidEngine(engine: Engine): engine is SolidEngine {
    return CLASS_MARKER in engine.constructor && engine.constructor[CLASS_MARKER] === 'SolidEngine';
}

export function isLocalEngine(engine: Engine): engine is LocalEngine {
    return CLASS_MARKER in engine.constructor && engine.constructor[CLASS_MARKER] === 'LocalEngine';
}
