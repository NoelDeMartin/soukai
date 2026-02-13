import { describe, expect, it } from 'vitest';

import Person from 'soukai-bis/testing/stubs/Person';

describe('BelongsToManyRelation', () => {

    it('initializes empty relations', async () => {
        // Arrange
        const bob = await Person.create({ name: 'Bob', friendUrls: [] });

        // Act
        const person = await Person.find(bob.url);

        // Assert
        expect(person?.relatedFriends.loaded).toBe(true);
        expect(person?.relatedFriends.isEmpty()).toBe(true);
        expect(person?.friends).toHaveLength(0);
    });

    it('doesn\'t initialize non-empty relations', async () => {
        // Arrange
        const alice = await Person.create({ name: 'Bob', friendUrls: [] });
        const bob = await Person.create({ name: 'Bob', friendUrls: [alice.url] });

        // Act
        const person = await Person.find(bob.url);

        // Assert
        expect(person?.relatedFriends.loaded).toBe(false);
        expect(person?.relatedFriends.isEmpty()).toBe(false);
        expect(person?.friends).toBeUndefined();
    });

});
