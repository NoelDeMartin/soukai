import { defineLocalEngineFileTests } from 'soukai-bis/testing/utils/local-engines';
import { describe } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';

describe('IndexedDBEngine files', () => defineLocalEngineFileTests(() => new IndexedDBEngine()));
