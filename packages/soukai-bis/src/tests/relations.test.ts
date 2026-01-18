import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import Post from 'soukai-bis/testing/stubs/Post';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import User from 'soukai-bis/testing/stubs/User';
import { bootModels } from 'soukai-bis/models/utils';
import { setEngine } from 'soukai-bis/engines';

describe('Relations', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ User, Post }, true);
    });

    it('belongsToOne', async () => {
        // Arrange
        const userDocumentUrl = fakeDocumentUrl();
        const userUrl = fakeResourceUrl({ documentUrl: userDocumentUrl });
        const post = new Post({ title: 'Hello World', authorUrl: userUrl });

        FakeServer.respondOnce(
            userDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${userUrl}>
                    a foaf:Person ;
                    foaf:name "Alice" .
            `,
        );

        // Act
        await post.loadRelation('author');

        // Assert
        expect(post.author).toBeInstanceOf(User);
        expect(post.author?.url).toEqual(userUrl);
        expect(post.author?.name).toEqual('Alice');
    });

    it('hasOne', async () => {
        // Arrange
        const postsContainerUrl = fakeContainerUrl();
        const postDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const postUrl = fakeResourceUrl({ documentUrl: postDocumentUrl });
        const userUrl = fakeResourceUrl();
        const user = new User({ url: userUrl, name: 'Alice' });

        Post.defaultContainerUrl = postsContainerUrl;
        FakeServer.respondOnce(postsContainerUrl, `<> <http://www.w3.org/ns/ldp#contains> <${postDocumentUrl}> .`);
        FakeServer.respondOnce(
            postDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${postUrl}>
                    a schema:Article ;
                    schema:name "Hello World" ;
                    schema:author <${userUrl}> .
            `,
        );

        // Act
        await user.loadRelation('post');

        // Assert
        expect(user.post).toBeInstanceOf(Post);
        expect(user.post?.url).toEqual(postUrl);
        expect(user.post?.title).toEqual('Hello World');
        expect(user.post?.authorUrl).toEqual(user.url);
    });

});
