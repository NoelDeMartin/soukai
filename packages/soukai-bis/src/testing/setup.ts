import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { FakeServer } from '@noeldemartin/testing';
import { patchZod } from 'soukai-bis/zod';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
    FakeServer.reset();

    vi.resetAllMocks();
});

patchZod();
installVitestSolidMatchers();
