import { describe, expect, it } from 'vitest';

import { safeContainerUrl } from './urls';

describe('urls', () => {

    it('safeContainerUrl', () => {
        expect(safeContainerUrl('solid://users/alice')).toBe('solid://users/');
        expect(safeContainerUrl('solid://users/friends/')).toBe('solid://users/');
        expect(safeContainerUrl('solid://users/')).toBe('solid://');
        expect(safeContainerUrl('solid://users')).toBe('solid://');
        expect(safeContainerUrl('solid://')).toBe(null);
    });

});
