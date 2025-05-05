import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootModels } from 'soukai';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import Show from 'soukai-solid/testing/lib/stubs/Show';
import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';

describe('SolidBelongsToOneRelation', () => {

    beforeAll(() => bootModels({ WatchAction, Movie, Show }));
    beforeEach(() => FakeSolidEngine.use());

    it('supports polymorphic relations', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const resourceUrl = fakeResourceUrl({ documentUrl });

        FakeSolidEngine.database[containerUrl] = {
            [documentUrl]: {
                '@graph': [
                    {
                        '@id': resourceUrl,
                        '@type': 'https://schema.org/WatchAction',
                        'https://schema.org/object': { '@id': `${documentUrl}#movie` },
                    },
                    {
                        '@id': `${documentUrl}#movie`,
                        '@type': 'https://schema.org/Movie',
                        'https://schema.org/name': 'Spirited Away',
                    },
                ],
            },
        };

        // Act
        const action = await WatchAction.find(resourceUrl);

        // Assert
        expect(action).toBeInstanceOf(WatchAction);
        expect(action?.movie).toBeInstanceOf(Movie);
        expect(action?.movie?.title).toEqual('Spirited Away');
        expect(action?.show).toBe(undefined);
    });

});
