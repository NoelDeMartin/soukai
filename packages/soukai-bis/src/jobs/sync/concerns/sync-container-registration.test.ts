import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import Container from 'soukai-bis/models/ldp/Container';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import Movie from 'soukai-bis/testing/stubs/Movie';
import User from 'soukai-bis/testing/stubs/User';
import { describe, expect, it, vi } from 'vite-plus/test';

import { syncContainerRegistration } from './sync-container-registration';
import type { ModelRegistration } from './sync-container-registration';

describe('Sync container registration', () => {
    it('reports registered models when other registrations fail', async () => {
        // Arrange
        const error = new Error('Registration failed');
        const typeIndex = new TypeIndex({ url: 'https://alice.example/settings/privateTypeIndex' }, { exists: true });
        const container = new Container(
            { url: 'https://alice.example/movies/watched/' },
            { exists: true },
        ) as ModelWithUrl<Container>;
        const events: unknown[] = [];

        vi.spyOn(Container.prototype, 'register').mockResolvedValueOnce().mockRejectedValueOnce(error);

        // Act
        await syncContainerRegistration({
            container,
            models: new Set<ModelConstructor>([User, Movie]),
            registeredContainers: new Map(),
            modelRegistrations: new Map<ModelConstructor, ModelRegistration>([
                [User, { containerUrl: 'https://alice.example/users/', visibility: 'private' }],
                [Movie, { containerUrl: 'https://alice.example/movies/', visibility: 'private' }],
            ]),
            getTypeIndex: async () => typeIndex,
            onModelsRegistered: (_, models) => events.push(['registered', models]),
            onModelsRegistrationFailed: (models, failure) => events.push(['failed', models, failure]),
        });

        // Assert
        expect(events).toEqual([
            ['registered', [User]],
            ['failed', [Movie], error],
        ]);
    });
});
