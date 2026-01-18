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

    it('belongsToMany', async () => {
        // Arrange
        const aliceDocumentUrl = fakeDocumentUrl();
        const aliceUrl = fakeResourceUrl({ documentUrl: aliceDocumentUrl });
        const bobDocumentUrl = fakeDocumentUrl();
        const bobUrl = fakeResourceUrl({ documentUrl: bobDocumentUrl });
        const charlieDocumentUrl = fakeDocumentUrl();
        const charlieUrl = fakeResourceUrl({ documentUrl: charlieDocumentUrl });
        const alice = new User({
            url: aliceUrl,
            name: 'Alice',
            friendUrls: [bobUrl, charlieUrl],
        });

        FakeServer.respondOnce(
            bobDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${bobUrl}>
                    a foaf:Person ;
                    foaf:name "Bob" .
            `,
        );

        FakeServer.respondOnce(
            charlieDocumentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

                <${charlieUrl}>
                    a foaf:Person ;
                    foaf:name "Charlie" .
            `,
        );

        // Act
        await alice.loadRelation('friends');

        // Assert
        expect(alice.friends).toHaveLength(2);
        expect(alice.friends?.[0]).toBeInstanceOf(User);
        expect(alice.friends?.map(({ name }) => name).sort()).toEqual(['Bob', 'Charlie']);
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
        await user.loadRelation('lastPost');

        // Assert
        expect(user.lastPost).toBeInstanceOf(Post);
        expect(user.lastPost?.url).toEqual(postUrl);
        expect(user.lastPost?.title).toEqual('Hello World');
        expect(user.lastPost?.authorUrl).toEqual(user.url);
    });

    it('hasMany', async () => {
        // Arrange
        const postsContainerUrl = fakeContainerUrl();
        const firstPostDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const secondPostDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const firstPostUrl = fakeResourceUrl({ documentUrl: firstPostDocumentUrl });
        const secondPostUrl = fakeResourceUrl({ documentUrl: secondPostDocumentUrl });
        const userUrl = fakeResourceUrl();
        const user = new User({ url: userUrl, name: 'Alice' });

        Post.defaultContainerUrl = postsContainerUrl;

        FakeServer.respondOnce(
            postsContainerUrl,
            `<> <http://www.w3.org/ns/ldp#contains> <${firstPostDocumentUrl}>, <${secondPostDocumentUrl}> .`,
        );

        FakeServer.respondOnce(
            firstPostDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${firstPostUrl}>
                    a schema:Article ;
                    schema:name "First Post" ;
                    schema:author <${userUrl}> .
            `,
        );

        FakeServer.respondOnce(
            secondPostDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${secondPostUrl}>
                    a schema:Article ;
                    schema:name "Second Post" ;
                    schema:author <${userUrl}> .
            `,
        );

        // Act
        await user.loadRelation('posts');

        // Assert
        expect(user.posts).toHaveLength(2);
        expect(user.posts?.[0]).toBeInstanceOf(Post);
        expect(user.posts?.map(({ title }) => title).sort()).toEqual(['First Post', 'Second Post']);
    });

});
