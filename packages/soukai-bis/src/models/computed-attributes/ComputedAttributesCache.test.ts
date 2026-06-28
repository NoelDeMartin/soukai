import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import SoukaiIndexedDB from 'soukai-bis/lib/SoukaiIndexedDB';
import Show from 'soukai-bis/testing/stubs/Show';
import User from 'soukai-bis/testing/stubs/User';
import type { ModelWithUrl } from 'soukai-bis/models/types';

import ComputedAttributesCache from './ComputedAttributesCache';

describe('ComputedAttributesCache', () => {

    beforeEach(async () => {
        ComputedAttributesCache.reset();

        await ComputedAttributesCache.close();
        await SoukaiIndexedDB.clear();
    });

    afterEach(async () => {
        await ComputedAttributesCache.close();
    });

    it('caches values in IndexedDB', async () => {
        // Arrange
        const user = new User({ url: 'https://alice.example.org#me', name: 'Alice' }) as ModelWithUrl;

        // Act
        await ComputedAttributesCache.set(user, 'test', 'Foo Bar');

        // Assert
        const connection = await SoukaiIndexedDB.connect();
        const document = await connection.get('computedAttributes', ['User', 'https://alice.example.org#me']);

        expect(document).toEqual({
            url: 'https://alice.example.org#me',
            model: 'User',
            test: 'Foo Bar',
        });
    });

    it('retrieves values from cache', async () => {
        // Arrange
        const user = new User({ url: 'https://alice.example.org#me', name: 'Alice' }) as ModelWithUrl;
        const connection = await SoukaiIndexedDB.connect();

        await connection.put('computedAttributes', {
            url: 'https://alice.example.org#me',
            model: 'User',
            test: 'cached value',
        });

        // Act
        const value = await ComputedAttributesCache.get(user, 'test');

        // Assert
        expect(value).toBe('cached value');
    });

    it('invalidates entries', async () => {
        // Arrange
        const firstUserDocumentUrl = fakeDocumentUrl();
        const secondUserDocumentUrl = fakeDocumentUrl();
        const firstUserUrl = fakeResourceUrl({ documentUrl: firstUserDocumentUrl });
        const secondUserUrl = fakeResourceUrl({ documentUrl: secondUserDocumentUrl });
        const firstUser = new User({ url: firstUserUrl, name: 'Alice' }) as ModelWithUrl;
        const secondUser = new User({ url: secondUserUrl, name: 'Bob' }) as ModelWithUrl;

        await ComputedAttributesCache.set(firstUser, 'postTitles', ['Hello World']);
        await ComputedAttributesCache.set(secondUser, 'postTitles', ['Hello World']);

        // Act
        await ComputedAttributesCache.invalidate([firstUserDocumentUrl]);

        // Assert
        expect(await ComputedAttributesCache.get(firstUser, 'postTitles')).toBeUndefined();
        expect(await ComputedAttributesCache.get(secondUser, 'postTitles')).toEqual(['Hello World']);
    });

    it('invalidates entries by container', async () => {
        // Arrange
        const now = new Date();
        const containerUrl = fakeContainerUrl();
        const firstShowDocumentUrl = fakeDocumentUrl({ containerUrl });
        const secondShowDocumentUrl = fakeDocumentUrl();
        const firstShowUrl = fakeResourceUrl({ documentUrl: firstShowDocumentUrl });
        const secondShowUrl = fakeResourceUrl({ documentUrl: secondShowDocumentUrl });
        const episodeDocumentUrl = `${containerUrl}season-1/episode-1`;
        const firstShow = new Show({ url: firstShowUrl, name: 'Freaks and Geeks' }) as ModelWithUrl;
        const secondShow = new Show({ url: secondShowUrl, name: 'House M.D.' }) as ModelWithUrl;

        await ComputedAttributesCache.set(firstShow, 'pendingEpisodeDates', [now]);
        await ComputedAttributesCache.set(secondShow, 'pendingEpisodeDates', [now]);

        // Act
        await ComputedAttributesCache.invalidate([episodeDocumentUrl]);

        // Assert
        expect(await ComputedAttributesCache.get(firstShow, 'pendingEpisodeDates')).toBeUndefined();
        expect(await ComputedAttributesCache.get(secondShow, 'pendingEpisodeDates')).toEqual([now]);
    });

});
