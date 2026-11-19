import 'fake-indexeddb/auto';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { bootSolidModels } from 'soukai-solid/models';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import { beforeEach, vi } from 'vite-plus/test';

installVitestSolidMatchers();
beforeEach(() => {
    vi.useRealTimers();
    FakeServer.reset();
    FakeSolidEngine.reset();

    bootSolidModels();
});
