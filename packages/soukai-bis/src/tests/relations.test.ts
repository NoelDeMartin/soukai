import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeContainerUrl, fakeDocumentUrl, fakeResourceUrl } from '@noeldemartin/testing';

import Movie from 'soukai-bis/testing/stubs/Movie';
import Post from 'soukai-bis/testing/stubs/Post';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import User from 'soukai-bis/testing/stubs/User';
import WatchAction from 'soukai-bis/testing/stubs/WatchAction';
import { bootModels } from 'soukai-bis/models/registry';
import { setEngine } from 'soukai-bis/engines';

describe('Relations', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ User, Post, PostsCollection, Movie, WatchAction }, true);
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

    it('belongsToMany attach', async () => {
        // Arrange
        const aliceDocumentUrl = fakeDocumentUrl();
        const aliceUrl = fakeResourceUrl({ documentUrl: aliceDocumentUrl });
        const bobDocumentUrl = fakeDocumentUrl();
        const bobUrl = fakeResourceUrl({ documentUrl: bobDocumentUrl });

        FakeServer.respondOnce(aliceDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(aliceDocumentUrl, FakeResponse.success());
        FakeServer.respondOnce(aliceDocumentUrl, FakeResponse.success());
        FakeServer.respondOnce(aliceDocumentUrl, FakeResponse.success());
        FakeServer.respondOnce(bobDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(bobDocumentUrl, FakeResponse.success());

        // Act
        const alice = await User.create({ url: aliceUrl, name: 'Alice' });
        const bob = alice.relatedFriends.attach({ url: bobUrl, name: 'Bob' });

        await alice.save();
        await bob.save();

        // Assert
        expect(alice.friendUrls).toContain(bob.url);
        expect(alice.friends).toHaveLength(1);
        expect(alice.friends?.[0]?.url).toEqual(bob.url);
        expect(alice.isDirty('friendUrls')).toBe(false);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);
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

    it('hasOne attach', async () => {
        // Arrange
        const movieDocumentUrl = fakeDocumentUrl();
        const movieUrl = fakeResourceUrl({ documentUrl: movieDocumentUrl });
        const actionDocumentUrl = fakeDocumentUrl();
        const actionUrl = fakeResourceUrl({ documentUrl: actionDocumentUrl });

        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(movieDocumentUrl, FakeResponse.success());
        FakeServer.respondOnce(actionDocumentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(actionDocumentUrl, FakeResponse.success());

        // Act
        const movie = await Movie.create({ url: movieUrl, title: 'Spiderman' });
        const action = movie.relatedAction.attach({ url: actionUrl });

        await action.save();

        // Assert
        expect(action.movieUrl).toEqual(movie.url);
        expect(movie.action).toBe(action);
        expect(action.exists()).toBe(true);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);
    });

    it('hasOne attach (same document)', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const movieUrl = fakeResourceUrl({ documentUrl });

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const movie = new Movie({ url: movieUrl, title: 'Spiderman' });
        const action = movie.relatedAction.attach({ url: `${documentUrl}#action` });

        await movie.save();

        // Assert
        expect(action.movieUrl).toEqual(movie.url);
        expect(action.url).not.toEqual(movie.url);
        expect(action.getDocumentUrl()).toEqual(movie.getDocumentUrl());
        expect(action.exists()).toBe(true);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix schema: <https://schema.org/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a schema:Movie ;
                    schema:name "Spiderman" .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:updatedAt "[[.*]]"^^xsd:dateTime ;
                    crdt:createdAt "[[.*]]"^^xsd:dateTime .

                <#action>
                    a schema:WatchAction ;
                    schema:object <#it> .

                <#action-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#action> ;
                    crdt:updatedAt "[[.*]]"^^xsd:dateTime ;
                    crdt:createdAt "[[.*]]"^^xsd:dateTime .
            }
        `);
    });

});
