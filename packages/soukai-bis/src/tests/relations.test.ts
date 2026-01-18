import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import User from 'soukai-bis/testing/stubs/User';
import { bootModels } from 'soukai-bis/models/utils';
import { setEngine } from 'soukai-bis/engines';

describe('Relations', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ User, Post, PostsCollection }, true);
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
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const firstPostUrl = fakeResourceUrl({ documentUrl: firstDocumentUrl });
        const secondPostUrl = fakeResourceUrl({ documentUrl: secondDocumentUrl });
        const userUrl = fakeResourceUrl();
        const user = new User({ url: userUrl, name: 'Alice' });

        Post.defaultContainerUrl = postsContainerUrl;

        FakeServer.respondOnce(
            postsContainerUrl,
            `<> <http://www.w3.org/ns/ldp#contains> <${firstDocumentUrl}>, <${secondDocumentUrl}> .`,
        );

        FakeServer.respondOnce(
            firstDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${firstPostUrl}>
                    a schema:Article ;
                    schema:name "First Post" ;
                    schema:author <${userUrl}> .
            `,
        );

        FakeServer.respondOnce(
            secondDocumentUrl,
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

    it('contains', async () => {
        // Arrange
        const postsContainerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const firstPostUrl = fakeResourceUrl({ documentUrl: firstDocumentUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl: postsContainerUrl });
        const secondPostUrl = fakeResourceUrl({ documentUrl: secondDocumentUrl });

        FakeServer.respondOnce(
            postsContainerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .

                <>
                    a ldp:Container ;
                    ldp:contains <${firstDocumentUrl}>, <${secondDocumentUrl}> .
            `,
        );

        FakeServer.respondOnce(
            firstDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${firstPostUrl}>
                    a schema:Article ;
                    schema:name "First Post" .
            `,
        );

        FakeServer.respondOnce(
            secondDocumentUrl,
            `
                @prefix schema: <https://schema.org/> .

                <${secondPostUrl}>
                    a schema:Article ;
                    schema:name "Second Post" .
            `,
        );

        // Act
        const collection = await PostsCollection.find(postsContainerUrl);

        await collection?.loadRelation('posts');

        // Assert
        expect(collection?.posts).toHaveLength(2);
        expect(collection?.posts?.[0]).toBeInstanceOf(Post);
        expect(collection?.posts?.map(({ title }) => title).sort()).toEqual(['First Post', 'Second Post']);
    });

    it('isContainedBy', async () => {
        // Arrange
        const postsCollectionUrl = fakeContainerUrl();
        const postDocumentUrl = fakeDocumentUrl({ containerUrl: postsCollectionUrl });
        const postUrl = fakeResourceUrl({ documentUrl: postDocumentUrl });
        const post = new Post({
            url: postUrl,
            title: 'Hello World',
        });

        FakeServer.respondOnce(
            postsCollectionUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

                <>
                    a ldp:Container ;
                    rdfs:label "Blog Posts" .
            `,
        );

        // Act
        await post.loadRelation('collection');

        // Assert
        expect(post.collection).toBeInstanceOf(PostsCollection);
        expect(post.collection?.url).toEqual(postsCollectionUrl);
        expect(post.collection?.name).toEqual('Blog Posts');
    });

});
