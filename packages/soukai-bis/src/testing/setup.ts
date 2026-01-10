import { installVitestSolidMatchers } from '@noeldemartin/solid-utils/vitest';
import { patchZod } from 'soukai-bis/zod';

patchZod();
installVitestSolidMatchers();
