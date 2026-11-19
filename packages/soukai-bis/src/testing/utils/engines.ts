import { FakeServer } from '@noeldemartin/testing';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine, setRemoteEngine } from 'soukai-bis/engines/state';
import { beforeEach } from 'vite-plus/test';

// Live binding, reassigned before each test by the global testing setup.
export let engine: InMemoryEngine;

export function resetTestingEngines(): void {
    engine = new InMemoryEngine();

    setEngine(engine);
    setRemoteEngine(new SolidEngine({ fetch: FakeServer.fetch }));
}

export function useSolidEngine(): void {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));
}
