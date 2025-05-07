import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootModels } from 'soukai';
import { fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import FakeSolidEngine from 'soukai-solid/testing/fakes/FakeSolidEngine';
import Movie from 'soukai-solid/testing/lib/stubs/Movie';
import Person from 'soukai-solid/testing/lib/stubs/Person';
import Post from 'soukai-solid/testing/lib/stubs/Post';
import Show from 'soukai-solid/testing/lib/stubs/Show';
import WatchAction from 'soukai-solid/testing/lib/stubs/WatchAction';

describe('SolidBelongsToOneRelation', () => {

    beforeAll(() => bootModels({ Person, Post, WatchAction, Movie, Show }));
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

    it('loads document models for non same document relations', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        FakeSolidEngine.database[containerUrl] = {
            [documentUrl]: {
                '@graph': [
                    {
                        '@id': `${documentUrl}#post`,
                        '@type': 'https://schema.org/Article',
                        'https://schema.org/name': 'Post',
                        'https://schema.org/author': { '@id': `${documentUrl}#author` },
                    },
                    {
                        '@id': `${documentUrl}#author`,
                        '@type': 'http://xmlns.com/foaf/0.1/Person',
                        'http://xmlns.com/foaf/0.1/name': 'Author',
                    },
                ],
            },
        };

        // Act
        const post = await Post.find(`${documentUrl}#post`);

        // Assert
        expect(post).toBeInstanceOf(Post);
        expect(post?.author).toBeInstanceOf(Person);
        expect(post?.author?.posts?.[0]).toBe(post);
    });

});
