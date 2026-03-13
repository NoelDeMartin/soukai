import { describe, expect, it } from 'vitest';

import User from 'soukai-bis/testing/stubs/User';

describe('BelongsToManyRelation', () => {

    it('initializes empty relations', async () => {
        // Arrange
        const bob = await User.create({ name: 'Bob', friendUrls: [] });

        // Act
        const user = await User.find(bob.url);

        // Assert
        expect(user?.relatedFriends.loaded).toBe(true);
        expect(user?.relatedFriends.isEmpty()).toBe(true);
        expect(user?.friends).toHaveLength(0);
    });

    it('doesn\'t initialize non-empty relations', async () => {
        // Arrange
        const alice = await User.create({ name: 'Bob', friendUrls: [] });
        const bob = await User.create({ name: 'Bob', friendUrls: [alice.url] });

        // Act
        const user = await User.find(bob.url);

        // Assert
        expect(user?.relatedFriends.loaded).toBe(false);
        expect(user?.relatedFriends.isEmpty()).toBe(false);
        expect(user?.friends).toBeUndefined();
    });

});
