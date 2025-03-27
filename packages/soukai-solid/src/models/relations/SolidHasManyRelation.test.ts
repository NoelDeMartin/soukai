import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { faker } from '@noeldemartin/faker';
import { bootModels } from 'soukai';
import type { EngineDocument } from 'soukai';
import { type Tuple, uuid } from '@noeldemartin/utils';

import IRI from 'soukai-solid/solid/utils/IRI';

import { stubMovieJsonLD, stubWatchActionJsonLD } from 'soukai-solid/testing/lib/stubs/helpers';
import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';
import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

describe('SolidHasManyRelation', () => {

    beforeAll(() => bootModels({ Movie, WatchAction }));
    beforeEach(() => FakeSolidEngine.use());

    it('loads models from different containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const otherContainerUrl = fakeContainerUrl();
        const movieUrl = fakeDocumentUrl({ containerUrl });
        const firstActionUrl = fakeResourceUrl({ documentUrl: movieUrl, hash: uuid() });
        const secondActionUrl = fakeDocumentUrl({ containerUrl: otherContainerUrl });

        FakeSolidEngine.database[containerUrl] = {
            [movieUrl]: {
                '@graph': [
                    stubMovieJsonLD(movieUrl, faker.lorem.word())['@graph'][0],
                    stubWatchActionJsonLD(firstActionUrl, movieUrl, '1997-07-21T23:42:00.000Z')['@graph'][0],
                    {
                        '@id': secondActionUrl,
                        [IRI('schema:object')]: { '@id': movieUrl },
                    },
                ],
            } as EngineDocument,
        };

        FakeSolidEngine.database[WatchAction.collection] = {
            [secondActionUrl]: stubWatchActionJsonLD(secondActionUrl, movieUrl, '2010-02-15T23:42:00.000Z'),
        };

        // Act
        const movie = (await Movie.find<Movie>(movieUrl)) as Movie;

        await movie.loadRelation('actions');

        // Assert
        const movieActions = movie.actions as Tuple<WatchAction, 2>;
        expect(movieActions).toHaveLength(2);

        expect(movieActions[0].url).toEqual(firstActionUrl);
        expect(movieActions[0].object).toEqual(movieUrl);
        expect(movieActions[0].startTime).toEqual(new Date('1997-07-21T23:42:00.000Z'));

        expect(movieActions[1].url).toEqual(secondActionUrl);
        expect(movieActions[1].object).toEqual(movieUrl);
        expect(movieActions[1].startTime).toEqual(new Date('2010-02-15T23:42:00.000Z'));

        expect(FakeSolidEngine.readMany).toHaveBeenCalledWith(expect.anything(), {
            '$in': [secondActionUrl],
            '@graph': {
                $contains: {
                    '@type': {
                        $or: [
                            { $contains: ['WatchAction'] },
                            { $contains: [IRI('schema:WatchAction')] },
                            { $eq: 'WatchAction' },
                            { $eq: IRI('schema:WatchAction') },
                        ],
                    },
                },
            },
        });
    });

    it('clones related models', () => {
        // Arrange
        const movie = new Movie();

        movie.relatedActions.attach({});
        movie.relatedActions.attach({});
        movie.relatedActions.attach({});

        // Act
        const relationClone = movie.relatedActions.clone();

        // Assert
        expect(relationClone.__newModels).toHaveLength(3);
        expect(relationClone.useSameDocument).toBe(true);
    });

});
