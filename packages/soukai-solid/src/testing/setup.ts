import 'fake-indexeddb/auto';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { bootSolidModels } from 'soukai-solid/models';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import { afterEach, beforeEach, vi } from 'vite-plus/test';

installVitestSolidMatchers();
beforeEach(() => {
    FakeServer.reset();
    FakeSolidEngine.reset();

    bootSolidModels();
});

afterEach(() => {
    vi.useRealTimers();
});
