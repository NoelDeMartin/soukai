import { defineLocalEngineFileTests } from 'soukai-bis/testing/utils/local-engines';
import { describe } from 'vite-plus/test';

import InMemoryEngine from './InMemoryEngine';

describe('InMemoryEngine files', () => defineLocalEngineFileTests(() => new InMemoryEngine()));
