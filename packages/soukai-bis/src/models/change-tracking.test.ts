import { AsyncLocalStorage } from 'node:async_hooks';

import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { runWithEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { setAsyncContextManager } from 'soukai-bis/lib/context';
import type { SoukaiAsyncContext } from 'soukai-bis/lib/context';
import { isChangeTrackingDisabled, runWithChangeTrackingDisabled } from 'soukai-bis/models/change-tracking';
import MovieWithHistory from 'soukai-bis/testing/stubs/MovieWithHistory';
import UserWithHistory from 'soukai-bis/testing/stubs/UserWithHistory';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

describe('Change tracking', () => {
    beforeEach(() => {
        const storage = new AsyncLocalStorage<SoukaiAsyncContext>();

        setAsyncContextManager({
            runWithValue: (context, operation) => storage.run(context, operation),
            getValue: () => storage.getStore(),
        });
    });

    it('disables timestamp updates and history tracking on updates', async () => {
        // Arrange
        const createdAt = new Date('2020-01-01T00:00:00.000Z');
        const user = await new UserWithHistory({
            name: 'Alice',
            friendUrls: ['https://bob.example/profile#me'],
        }).save({ date: createdAt });

        vi.setSystemTime(new Date('2020-01-02T00:00:00.000Z'));

        // Act
        await runWithChangeTrackingDisabled(async () => {
            user.name = 'Alicia';
            user.friendUrls = ['https://carol.example/profile#me'];

            await user.save();
        });

        // Assert
        const freshUser = await UserWithHistory.findOrFail(user.url);

        expect(isChangeTrackingDisabled()).toBe(false);
        expect(freshUser.name).toBe('Alicia');
        expect(freshUser.friendUrls).toEqual(['https://carol.example/profile#me']);
        expect(freshUser.createdAt).toEqual(createdAt);
        expect(freshUser.updatedAt).toEqual(createdAt);
        expect(await freshUser.loadRelation('operations')).toHaveLength(0);
    });

    it('disables change tracking across related models and new models', async () => {
        // Arrange
        const createdAt = new Date('2020-01-01T00:00:00.000Z');
        const updatedAt = new Date('2020-01-02T00:00:00.000Z');
        const draftMovie = new MovieWithHistory({ title: 'Spirited Away' });

        draftMovie.relatedAction.attach({ startTime: createdAt });

        const movie = await draftMovie.save({ date: createdAt });

        vi.setSystemTime(updatedAt);

        // Act
        const newUser = await runWithChangeTrackingDisabled(async () => {
            movie.title = 'Sen to Chihiro';
            movie.action!.startTime = updatedAt;

            await movie.save();

            return UserWithHistory.create({ name: 'Bob' });
        });

        // Assert
        const freshMovie = await MovieWithHistory.findOrFail(movie.url);
        const freshUser = await UserWithHistory.findOrFail(newUser.url);

        expect(freshMovie.title).toBe('Sen to Chihiro');
        expect(freshMovie.updatedAt).toEqual(createdAt);
        expect(freshMovie.action?.updatedAt).toEqual(createdAt);
        expect(await freshMovie.loadRelation('operations')).toHaveLength(0);

        expect(freshUser.name).toBe('Bob');
        expect(freshUser.createdAt).toBeUndefined();
        expect(freshUser.updatedAt).toBeUndefined();
        expect(freshUser.metadata).toBeNull();
    });

    it('restores change tracking after callback completes or throws', async () => {
        // Arrange
        const createdAt = new Date('2020-01-01T00:00:00.000Z');
        const updatedAt = new Date('2020-01-02T00:00:00.000Z');
        const user = await new UserWithHistory({ name: 'Alice' }).save({ date: createdAt });

        // Act
        await expect(
            runWithChangeTrackingDisabled(async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');

        vi.setSystemTime(updatedAt);

        await user.update({ name: 'Alicia' });

        // Assert
        const freshUser = await UserWithHistory.findOrFail(user.url);

        expect(freshUser.updatedAt).toEqual(updatedAt);
        expect(await freshUser.loadRelation('operations')).not.toHaveLength(0);
    });

    it('composes nested runWithEngine and runWithChangeTrackingDisabled calls', async () => {
        // Arrange
        const customEngine = new InMemoryEngine();
        const createdAt = new Date('2020-01-01T00:00:00.000Z');
        const user = await runWithEngine(customEngine, () =>
            new UserWithHistory({ name: 'Alice' }).save({ date: createdAt }),
        );

        vi.setSystemTime(new Date('2020-01-02T00:00:00.000Z'));

        // Act
        await runWithEngine(customEngine, () =>
            runWithChangeTrackingDisabled(async () => {
                await user.update({ name: 'Alicia' });
            }),
        );

        // Assert
        const freshUser = await runWithEngine(customEngine, () => UserWithHistory.findOrFail(user.url));

        expect(freshUser.name).toBe('Alicia');
        expect(freshUser.updatedAt).toEqual(createdAt);
        expect(await runWithEngine(customEngine, () => freshUser.loadRelation('operations'))).toHaveLength(0);
    });

    it('throws when soft deleting or restoring while change tracking is disabled', async () => {
        // Arrange
        const user = await UserWithHistory.create({ name: 'Alice' });

        // Act & Assert
        await expect(runWithChangeTrackingDisabled(() => user.softDelete())).rejects.toThrow(SoukaiError);

        await user.softDelete();

        await expect(runWithChangeTrackingDisabled(() => user.restore())).rejects.toThrow(SoukaiError);
    });

    it('throws when soft deleting a model without metadata', async () => {
        // Arrange
        const user = await runWithChangeTrackingDisabled(() => UserWithHistory.create({ name: 'Alice' }));

        // Act & Assert
        await expect(user.softDelete()).rejects.toThrow(SoukaiError);
    });
});
