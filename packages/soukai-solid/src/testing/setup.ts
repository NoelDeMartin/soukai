import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { beforeEach } from 'vitest';

import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import { bootSolidModels } from 'soukai-solid/models';

installVitestSolidMatchers();
beforeEach(() => {
    FakeServer.reset();
    FakeSolidEngine.reset();

    bootSolidModels();
});
