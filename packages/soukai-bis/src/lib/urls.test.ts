import { describe, expect, it } from 'vite-plus/test';

import { isLocalUrl } from './urls';

describe('URL helpers', () => {
    it('detects local urls', () => {
        expect(isLocalUrl('local://movies/alien#it')).toBe(true);
        expect(isLocalUrl('local://')).toBe(true);
        expect(isLocalUrl('https://alice.pod/movies/alien#it')).toBe(false);
        expect(isLocalUrl('local:foo')).toBe(false);
        expect(isLocalUrl('solid:publicTypeIndex')).toBe(false);
    });
});
