import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vite-plus/test';

afterEach(() => {
    vi.useRealTimers();
});
