import 'soukai-bis/patch-zod';

import { beforeEach, vi } from 'vitest';
import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';

import { bootCoreModels } from 'soukai-bis/models/core';

beforeEach(() => {
    bootCoreModels(true);
    FakeServer.reset();

    vi.resetAllMocks();
});

installVitestSolidMatchers();
