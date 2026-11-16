import { modelsTrackingLocalChanges } from './internals/model';
import type { ModelConstructor } from './types';

export function trackLocalChanges(model: ModelConstructor): void {
    modelsTrackingLocalChanges.add(model);
}

export function tracksLocalChanges(model: ModelConstructor): boolean {
    return modelsTrackingLocalChanges.has(model);
}
