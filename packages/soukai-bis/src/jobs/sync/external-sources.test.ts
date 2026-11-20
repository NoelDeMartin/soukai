import Post from 'soukai-bis/testing/stubs/Post';
import { describe, expect, it } from 'vite-plus/test';

import { restoreExternalSource, serializeExternalSource } from './external-sources';
import type { ExternalSource } from './external-sources';

describe('External sources', () => {
    it('serializes external sources', () => {
        // Arrange
        const containerSource: ExternalSource = { containerUrl: 'https://bob.example/posts/', models: [Post] };
        const instanceSource: ExternalSource = { instanceUrl: 'https://bob.example/profile#it', models: [Post] };

        // Act
        const serializedSources = [containerSource, instanceSource].map(serializeExternalSource);

        // Assert
        expect(serializedSources).toEqual([
            { containerUrl: 'https://bob.example/posts/', modelNames: ['Post'] },
            { instanceUrl: 'https://bob.example/profile#it', modelNames: ['Post'] },
        ]);
        expect(serializedSources.map(restoreExternalSource)).toEqual([containerSource, instanceSource]);
    });
});
