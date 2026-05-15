import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';

import User from 'soukai-bis/testing/stubs/User';
import type { ModelWithUrl } from 'soukai-bis/models/types';

import ComputedAttributesCache from './ComputedAttributesCache';

describe('ComputedAttributesCache', () => {

    beforeEach(async () => {
        ComputedAttributesCache.reset();

        await ComputedAttributesCache.closeConnections();
        await deleteDB('soukai-computed-attributes');
    });

    afterEach(async () => {
        await ComputedAttributesCache.closeConnections();
    });

    it('caches values in IndexedDB', async () => {
        // Arrange
        const user = new User({ url: 'https://alice.example.org#me', name: 'Alice' }) as ModelWithUrl;

        // Act
        await ComputedAttributesCache.set(user, 'test', 'Foo Bar');

        // Assert
        const connection = await openDB('soukai-computed-attributes');
        const document = await connection.get('attributes', ['User', 'https://alice.example.org#me']);

        expect(document).toEqual({
            url: 'https://alice.example.org#me',
            model: 'User',
            test: 'Foo Bar',
        });

        connection.close();
    });

    it('retrieves values from cache', async () => {
        // Arrange
        const user = new User({ url: 'https://alice.example.org#me', name: 'Alice' }) as ModelWithUrl;
        const connection = await openDB('soukai-computed-attributes', 1, {
            upgrade(database) {
                database.createObjectStore('attributes', { keyPath: ['model', 'url'] });
            },
        });

        await connection.put('attributes', {
            url: 'https://alice.example.org#me',
            model: 'User',
            test: 'cached value',
        });

        connection.close();

        // Act
        const value = await ComputedAttributesCache.get(user, 'test');

        // Assert
        expect(value).toBe('cached value');
    });

});
