import { describe, expect, it } from 'vite-plus/test';

import { safeContainerUrl } from './urls';

describe('URL helpers (internals)', () => {
    it('safeContainerUrl', () => {
        expect(safeContainerUrl('local://users/alice')).toBe('local://users/');
        expect(safeContainerUrl('local://users/friends/')).toBe('local://users/');
        expect(safeContainerUrl('local://users/')).toBe('local://');
        expect(safeContainerUrl('local://users')).toBe('local://');
        expect(safeContainerUrl('local://')).toBe(null);
    });
});
