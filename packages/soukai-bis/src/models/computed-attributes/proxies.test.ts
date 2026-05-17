import { describe, expect, it } from 'vitest';

import { computedProxy, unpackComputedValue } from './proxies';
import { UndefinedComputedValue } from 'soukai-bis/errors';

describe('Computed Proxies', () => {

    it('computes values', () => {
        const proxy = computedProxy({ name: 'Alice' });

        expect(proxy.name).toBe('Alice');
    });

    it('intercepts undefined values', () => {
        const proxy = computedProxy({ name: 'Alice' } as {
            name: string;
            friends?: { name?: string }[];
        });

        expect(() => proxy.friends.map((friend) => friend.name)).toThrow(UndefinedComputedValue);
    });

    it('unpacks undefined values', () => {
        const proxy = computedProxy({ name: 'Alice', friends: [{ name: 'Bob' }, {}] } as {
            name: string;
            friends?: { name?: string }[];
        });

        const friendNames = proxy.friends.map((friend) => friend.name);
        const unpackedFriendNames = unpackComputedValue(friendNames);

        expect(friendNames).toHaveLength(2);
        expect(friendNames[0]).toEqual('Bob');
        expect(friendNames[1]).not.toBeUndefined();
        expect(unpackedFriendNames).toEqual(['Bob', undefined]);
    });

});
